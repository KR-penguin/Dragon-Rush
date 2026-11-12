"""Gymnasium-style clients for the combat env server (numpy only, docs/combat-ai-spec.md §9).

The combat model is separate from the board model: its own observation (cobs_v1, 160 floats),
actions (cact_v1, MultiDiscrete [9, 4] or flat 36) and server process (combat-env-server).
"""
from __future__ import annotations

import base64
import os
from typing import Any, Literal, Mapping, Sequence

import numpy as np

from ._process import ServerProcess
from .env import describe_obs
from .errors import RPGBoardEnvError

COBS_VERSION = "cobs_v1"
CACT_VERSION = "cact_v1"
DEFAULT_COMBAT_SERVER = ["node", "packages/sim/dist/combat-env-server.js"]


def _decode(obs: Any) -> np.ndarray:
    if isinstance(obs, str):
        return np.frombuffer(base64.b64decode(obs), dtype="<f4").astype(np.float32)
    return np.asarray(obs, dtype=np.float32)


class _CombatBase:
    def __init__(
        self,
        num_envs: int,
        auto_reset: bool,
        controlled: str = "both",
        opponent: str = "scripted:pool",
        mode_mix: Mapping[str, float] | None = None,
        jobs: str | Sequence[str] = "uniform",
        stat_sampler: str = "uniform_board",
        action_repeat: int = 4,
        obs_delay: int | Sequence[int] = (4, 18),
        flat_actions: bool = False,
        reward: Mapping[str, float] | None = None,
        dragon_curriculum: Mapping[str, Sequence[float]] | None = None,
        mirror: bool = True,
        rules: str | Mapping[str, Any] = "default",
        return_events: bool = False,
        server_cmd: str | Sequence[str] | None = None,
        cwd: str | os.PathLike[str] | None = None,
        expect_cobs_version: str = COBS_VERSION,
        expect_cact_version: str = CACT_VERSION,
        timeout: float = 60.0,
    ) -> None:
        self.num_envs = num_envs
        self.flat_actions = flat_actions
        self.n_ctrl = 2 if controlled == "both" else 1
        self._auto_reset = auto_reset
        self._config: dict[str, Any] = {
            "controlled": controlled,
            "opponent": opponent,
            "mode_mix": dict(mode_mix) if mode_mix is not None else {"pvp": 0.75, "dragon": 0.25},
            "jobs": jobs if isinstance(jobs, str) else list(jobs),
            "stat_sampler": stat_sampler,
            "action_repeat": int(action_repeat),
            "obs_delay": int(obs_delay) if isinstance(obs_delay, int) else [int(x) for x in obs_delay],
            "flat_actions": bool(flat_actions),
            "mirror": bool(mirror),
            "rules": rules if isinstance(rules, str) else dict(rules),
            "return_events": bool(return_events),
        }
        if reward is not None:
            self._config["reward"] = dict(reward)
        if dragon_curriculum is not None:
            self._config["dragon_curriculum"] = {k: [float(x) for x in v] for k, v in dragon_curriculum.items()}
        self._proc = ServerProcess(server_cmd, cwd, timeout, DEFAULT_COMBAT_SERVER, "RPGBOARD_COMBAT_ENV_CMD")
        info = self._proc.call("info")
        if info["cobs_version"] != expect_cobs_version or info["cact_version"] != expect_cact_version:
            self._proc.close()
            raise RPGBoardEnvError(
                "VERSION_MISMATCH",
                f"server {info['cobs_version']}/{info['cact_version']} != expected {expect_cobs_version}/{expect_cact_version}",
            )
        self.obs_dim: int = info["cobs_dim"]
        self.action_nvec: tuple[int, int] = (int(info["cact_nvec"][0]), int(info["cact_nvec"][1]))
        self.flat_dim: int = info["cact_flat_dim"]
        self.tick_hz: int = info["tick_hz"]
        self.cobs_version: str = info["cobs_version"]
        self.cact_version: str = info["cact_version"]
        self.combat_rules_version: str = info["combat_rules_version"]
        self.combat_rules_hash: int = info["combat_rules_hash"]
        self.obs_layout: list[dict[str, Any]] = list(info["obs_layout"])
        self.action_names: dict[str, list[str]] = {k: list(v) for k, v in info["action_names"].items()}
        self.bots: list[str] = list(info["bots"])

    def _reset_raw(self, seed: int | None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "num_envs": self.num_envs,
            "encoding": "b64",
            "auto_reset": self._auto_reset,
            "config": self._config,
        }
        if seed is not None:
            params["seed"] = int(seed)
        result = self._proc.call("reset", params)
        self.combat_rules_hash = result["combat_rules_hash"]
        return result["envs"]

    def _actions(self, actions: Any) -> list[list[Any]]:
        a = np.asarray(actions, dtype=np.int64)
        if self.flat_actions:
            a = a.reshape(self.num_envs, self.n_ctrl)
            return [[int(x) for x in row] for row in a]
        a = a.reshape(self.num_envs, self.n_ctrl, 2)
        return [[[int(m), int(b)] for m, b in row] for row in a]

    def _env_info(self, e: dict[str, Any]) -> dict[str, Any]:
        info: dict[str, Any] = {
            "actionable": np.asarray(e["actionable"], dtype=bool),
            "active": np.asarray(e["active"], dtype=bool),
            "ticks_elapsed": int(e["ticks_elapsed"]),
            "tick": int(e["tick"]),
            "mode": e["mode"],
            "outcome": e["outcome"],
            "final_obs": {int(k): _decode(v) for k, v in e["final_obs"].items()},
            "episode_start": e.get("episode_start"),
        }
        if self.flat_actions:
            info["action_mask"] = np.asarray(e["mask"], dtype=bool)
        else:
            info["move_mask"] = np.asarray(e["move_mask"], dtype=bool)
            info["button_mask"] = np.asarray(e["button_mask"], dtype=bool)
        if "events" in e:
            info["events"] = e["events"]
        return info

    def _obs(self, e: dict[str, Any]) -> np.ndarray:
        return np.stack([_decode(o) for o in e["obs"]])

    def describe(self, obs: np.ndarray) -> dict[str, Any]:
        """Names each cobs_v1 field of one (160,) observation: scalars as float, groups as lists."""
        return describe_obs(np.asarray(obs).reshape(-1)[: self.obs_dim], self.obs_layout)

    def close(self) -> None:
        self._proc.close()

    def __enter__(self):  # noqa: ANN204
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class CombatVecEnv(_CombatBase):
    """Batched combat environments in one server process; finished envs reset automatically.

    Shapes: obs (N, n_ctrl, 160) float32, reward (N, n_ctrl) float32, terminated/truncated (N,) bool,
    actions (N, n_ctrl, 2) int64 or (N, n_ctrl) with flat_actions.
    """

    def __init__(self, num_envs: int = 64, **kwargs: Any) -> None:
        super().__init__(num_envs=num_envs, auto_reset=True, **kwargs)

    def _batch_info(self, envs: list[dict[str, Any]]) -> dict[str, Any]:
        infos = [self._env_info(e) for e in envs]
        out: dict[str, Any] = {
            "actionable": np.stack([x["actionable"] for x in infos]),
            "active": np.stack([x["active"] for x in infos]),
            "ticks_elapsed": np.asarray([x["ticks_elapsed"] for x in infos], dtype=np.int64),
            "tick": np.asarray([x["tick"] for x in infos], dtype=np.int64),
            "mode": [x["mode"] for x in infos],
            "outcome": [x["outcome"] for x in infos],
            "final_obs": [x["final_obs"] for x in infos],
            "episode_start": [x["episode_start"] for x in infos],
        }
        keys = ["action_mask"] if self.flat_actions else ["move_mask", "button_mask"]
        for k in keys:
            out[k] = np.stack([x[k] for x in infos])
        if infos and "events" in infos[0]:
            out["events"] = [x.get("events") for x in infos]
        return out

    def reset(self, seed: int | None = None) -> tuple[np.ndarray, dict[str, Any]]:
        envs = self._reset_raw(seed)
        return np.stack([self._obs(e) for e in envs]), self._batch_info(envs)

    def step(self, actions: Any) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
        envs = self._proc.call("step", {"actions": self._actions(actions)})["envs"]
        obs = np.stack([self._obs(e) for e in envs])
        rewards = np.asarray([e["rewards"] for e in envs], dtype=np.float32)
        terminated = np.asarray([e["terminated"] for e in envs], dtype=bool)
        truncated = np.asarray([e["truncated"] for e in envs], dtype=bool)
        return obs, rewards, terminated, truncated, self._batch_info(envs)


class CombatEnv(_CombatBase):
    """Single combat environment. After `terminated or truncated`, call `reset()` again.

    Shapes: obs (n_ctrl, 160), reward (n_ctrl,), action (n_ctrl, 2) or (n_ctrl,) with flat_actions.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(num_envs=1, auto_reset=False, **kwargs)

    def reset(self, seed: int | None = None) -> tuple[np.ndarray, dict[str, Any]]:
        e = self._reset_raw(seed)[0]
        return self._obs(e), self._env_info(e)

    def step(self, action: Any) -> tuple[np.ndarray, np.ndarray, bool, bool, dict[str, Any]]:
        e = self._proc.call("step", {"actions": self._actions(action)})["envs"][0]
        rewards = np.asarray(e["rewards"], dtype=np.float32)
        return self._obs(e), rewards, bool(e["terminated"]), bool(e["truncated"]), self._env_info(e)


def _fixed_mode(mode: Literal["pvp", "dragon"], kwargs: dict[str, Any]) -> dict[str, Any]:
    if "mode_mix" in kwargs:
        raise ValueError("mode_mix cannot be set on a fixed-mode combat environment")
    return {**kwargs, "mode_mix": {"pvp": int(mode == "pvp"), "dragon": int(mode == "dragon")}}


class PvPCombatEnv(CombatEnv):
    """One 1v1 duel. Both fighters are controlled by default; use controlled='p0' for a scripted rival."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**_fixed_mode("pvp", kwargs))


class PvPCombatVecEnv(CombatVecEnv):
    """Batched 1v1 duels with automatic reset into another duel."""

    def __init__(self, num_envs: int = 64, **kwargs: Any) -> None:
        super().__init__(num_envs=num_envs, **_fixed_mode("pvp", kwargs))


class DragonCombatEnv(CombatEnv):
    """One fighter against the dragon. Controls slot 0 only by default."""

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("controlled", "p0")
        super().__init__(**_fixed_mode("dragon", kwargs))


class DragonCombatVecEnv(CombatVecEnv):
    """Batched dragon fights with automatic reset into another dragon fight."""

    def __init__(self, num_envs: int = 64, **kwargs: Any) -> None:
        kwargs.setdefault("controlled", "p0")
        super().__init__(num_envs=num_envs, **_fixed_mode("dragon", kwargs))
