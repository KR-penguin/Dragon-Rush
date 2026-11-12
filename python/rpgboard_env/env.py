"""Gymnasium-style clients for the Dragon Rush env server (numpy only)."""
from __future__ import annotations

import base64
import os
from typing import Any, Sequence

import numpy as np

from ._process import ServerProcess
from .errors import RPGBoardEnvError

OBS_VERSION = "obs_v2"
ACT_VERSION = "act_v1"


def _decode(obs: Any) -> np.ndarray:
    if isinstance(obs, str):
        return np.frombuffer(base64.b64decode(obs), dtype="<f4").astype(np.float32)
    return np.asarray(obs, dtype=np.float32)


def describe_obs(obs: np.ndarray, layout: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Maps a flat observation to {field name: value} using the server's obs_layout."""
    out: dict[str, Any] = {}
    for field in layout:
        chunk = obs[field["offset"] : field["offset"] + field["length"]]
        out[field["name"]] = float(chunk[0]) if field["length"] == 1 else [float(x) for x in chunk]
    return out


class _Base:
    def __init__(
        self,
        num_envs: int,
        auto_reset: bool,
        mode: str = "single",
        num_players: int | Sequence[int] = 4,
        agent_seat: int | str = "random",
        controlled_seats: Sequence[int] | str = "all",
        jobs: Sequence[str] | str = "random",
        opponents: str | Sequence[str] = "heuristic",
        max_rounds: int | None = 100,
        rules: str | dict[str, Any] = "default",
        reward_shaping: dict[str, float] | None = None,
        return_events: bool = False,
        combat_resolver: str = "outcome",
        outcome_model: str | None = None,
        outcome_skill_noise: float = 0.5,
        expect_outcome_model_id: str | None = None,
        server_cmd: str | Sequence[str] | None = None,
        cwd: str | os.PathLike[str] | None = None,
        expect_obs_version: str = OBS_VERSION,
        expect_act_version: str = ACT_VERSION,
        timeout: float = 60.0,
    ) -> None:
        self.mode = mode
        self.num_envs = num_envs
        self._auto_reset = auto_reset
        self._config: dict[str, Any] = {
            "mode": mode,
            "num_players": num_players if isinstance(num_players, int) else list(num_players),
            "agent_seat": agent_seat,
            "controlled_seats": controlled_seats if isinstance(controlled_seats, str) else list(controlled_seats),
            "jobs": jobs if isinstance(jobs, str) else list(jobs),
            "opponents": opponents if isinstance(opponents, str) else list(opponents),
            "max_rounds": max_rounds,
            "rules": rules,
            "reward_shaping": reward_shaping,
            "return_events": return_events,
            "combat_resolver": combat_resolver,
            "outcome_skill_noise": outcome_skill_noise,
        }
        if outcome_model is not None:
            self._config["outcome_model"] = outcome_model
        self._expect_outcome_model_id = expect_outcome_model_id
        self.combat_resolver = combat_resolver
        self.outcome_model_id: str | None = None
        self._proc = ServerProcess(server_cmd, cwd, timeout)
        info = self._proc.call("info")
        if info["obs_version"] != expect_obs_version or info["act_version"] != expect_act_version:
            self._proc.close()
            raise RPGBoardEnvError(
                "VERSION_MISMATCH",
                f"server {info['obs_version']}/{info['act_version']} != expected {expect_obs_version}/{expect_act_version}",
            )
        self.obs_dim: int = info["obs_dim"]
        self.action_dim: int = info["action_dim"]
        self.obs_version: str = info["obs_version"]
        self.act_version: str = info["act_version"]
        self.rules_version: str = info["rules_version"]
        self.action_names: list[str] = list(info["action_names"])
        self.obs_layout: list[dict[str, Any]] = list(info["obs_layout"])
        self._agent_seats = [0] * num_envs

    def _reset_raw(self, seed: int | None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "num_envs": self.num_envs,
            "encoding": "b64",
            "auto_reset": self._auto_reset,
            "config": self._config,
        }
        if seed is not None:
            params["seed"] = int(seed)
        if self._expect_outcome_model_id is not None:
            params["expect"] = {"outcome_model_id": self._expect_outcome_model_id}
        result = self._proc.call("reset", params)
        self.outcome_model_id = result.get("outcome_model_id")
        envs = result["envs"]
        for i, e in enumerate(envs):
            self._agent_seats[i] = e["episode_start"].get("agent_seat") or 0
        return envs

    def _mask(self, legal: list[int]) -> np.ndarray:
        mask = np.zeros(self.action_dim, dtype=bool)
        mask[legal] = True
        return mask

    def _reward(self, i: int, e: dict[str, Any]) -> Any:
        rewards = np.asarray(e["rewards"], dtype=np.float32)
        if self.mode == "single":
            return float(rewards[self._agent_seats[i]])
        return rewards

    def _info(self, e: dict[str, Any]) -> dict[str, Any]:
        info: dict[str, Any] = {
            "action_mask": self._mask(e["legal"]),
            "legal": list(e["legal"]),
            "acting_seat": e["acting_seat"],
            "turn_seat": e["turn_seat"],
            "phase": e["phase"],
            "round": e["round"],
            "seat_rewards": np.asarray(e["rewards"], dtype=np.float32),
            "eliminated": list(e["eliminated"]),
            "outcome": e["outcome"],
            "final_obs": {int(k): _decode(v) for k, v in e["final_obs"].items()},
            "episode_start": e.get("episode_start"),
            "combat_resolver": self.combat_resolver,
            "outcome_model_id": self.outcome_model_id,
        }
        if "events" in e:
            info["events"] = e["events"]
        return info

    def describe(self, obs: np.ndarray) -> dict[str, Any]:
        """Names each obs_v2 field: scalars as float, multi-value fields as lists (debugging aid)."""
        return describe_obs(obs, self.obs_layout)

    def close(self) -> None:
        self._proc.close()

    def __enter__(self):  # noqa: ANN204
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class RPGBoardEnv(_Base):
    """Single environment. After `terminated or truncated`, call `reset()` again."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(num_envs=1, auto_reset=False, **kwargs)

    def reset(self, seed: int | None = None) -> tuple[np.ndarray, dict[str, Any]]:
        e = self._reset_raw(seed)[0]
        return _decode(e["obs"]), self._info(e)

    def step(self, action: int) -> tuple[np.ndarray, Any, bool, bool, dict[str, Any]]:
        e = self._proc.call("step", {"actions": [int(action)]})["envs"][0]
        reward = self._reward(0, e)
        return _decode(e["obs"]), reward, bool(e["terminated"]), bool(e["truncated"]), self._info(e)


class RPGBoardVecEnv(_Base):
    """Batched environments in one server process; finished envs reset automatically."""

    def __init__(self, num_envs: int = 8, **kwargs: Any) -> None:
        super().__init__(num_envs=num_envs, auto_reset=True, **kwargs)

    def _batch_info(self, envs: list[dict[str, Any]]) -> dict[str, Any]:
        infos = [self._info(e) for e in envs]
        return {
            "action_mask": np.stack([x["action_mask"] for x in infos]),
            "acting_seat": np.asarray([x["acting_seat"] for x in infos], dtype=np.int64),
            "turn_seat": np.asarray([x["turn_seat"] for x in infos], dtype=np.int64),
            "round": np.asarray([x["round"] for x in infos], dtype=np.int64),
            "phase": [x["phase"] for x in infos],
            "seat_rewards": np.stack([x["seat_rewards"] for x in infos]),
            "eliminated": [x["eliminated"] for x in infos],
            "outcome": [x["outcome"] for x in infos],
            "final_obs": [x["final_obs"] for x in infos],
            "episode_start": [x["episode_start"] for x in infos],
        }

    def reset(self, seed: int | None = None) -> tuple[np.ndarray, dict[str, Any]]:
        envs = self._reset_raw(seed)
        return np.stack([_decode(e["obs"]) for e in envs]), self._batch_info(envs)

    def step(self, actions: Sequence[int] | np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
        envs = self._proc.call("step", {"actions": [int(a) for a in actions]})["envs"]
        rewards = np.stack([np.asarray(self._reward(i, e), dtype=np.float32) for i, e in enumerate(envs)])
        for i, e in enumerate(envs):
            start = e.get("episode_start")
            if start is not None:
                self._agent_seats[i] = start.get("agent_seat") or 0
        obs = np.stack([_decode(e["obs"]) for e in envs])
        terminated = np.asarray([e["terminated"] for e in envs], dtype=bool)
        truncated = np.asarray([e["truncated"] for e in envs], dtype=bool)
        return obs, rewards, terminated, truncated, self._batch_info(envs)
