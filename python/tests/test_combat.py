import os
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from rpgboard_env import (  # noqa: E402
    CombatEnv,
    CombatVecEnv,
    DragonCombatEnv,
    DragonCombatVecEnv,
    IllegalActionError,
    PvPCombatEnv,
    PvPCombatVecEnv,
    RPGBoardEnvError,
)

SERVER = ["node", "--import", "tsx", "packages/sim/src/combat-env-server.ts"]
KW = dict(server_cmd=SERVER, cwd=str(ROOT))


def random_actions(info: dict, rng: np.random.Generator, flat: bool) -> np.ndarray:
    def pick(mask: np.ndarray) -> np.ndarray:
        flat_mask = mask.reshape(-1, mask.shape[-1])
        out = np.array([rng.choice(np.flatnonzero(m)) for m in flat_mask])
        return out.reshape(mask.shape[:-1])

    if flat:
        return pick(info["action_mask"])
    return np.stack([pick(info["move_mask"]), pick(info["button_mask"])], axis=-1)


def test_vec_env_shapes_rewards_and_auto_reset():
    with CombatVecEnv(num_envs=4, **KW) as env:
        assert env.obs_dim == 160 and env.action_nvec == (9, 4) and env.flat_dim == 36 and env.n_ctrl == 2
        assert env.cobs_version == "cobs_v1" and env.cact_version == "cact_v1"
        assert len(env.action_names["flat"]) == 36
        obs, info = env.reset(seed=1)
        assert obs.shape == (4, 2, 160) and obs.dtype == np.float32
        assert info["move_mask"].shape == (4, 2, 9) and info["move_mask"].dtype == bool
        assert info["button_mask"].shape == (4, 2, 4)
        assert info["actionable"].shape == (4, 2) and info["active"].shape == (4, 2)
        assert all(s is not None for s in info["episode_start"])
        rng = np.random.default_rng(0)
        ended = 0
        for _ in range(1500):
            obs, reward, terminated, truncated, info = env.step(random_actions(info, rng, False))
            assert reward.shape == (4, 2) and reward.dtype == np.float32
            assert terminated.shape == (4,) and truncated.dtype == bool
            assert info["ticks_elapsed"].shape == (4,)
            assert np.all(obs >= -1) and np.all(obs <= 2)
            for i in np.flatnonzero(terminated):
                ended += 1
                assert info["outcome"][i]["reason"] in ("ko", "timeout")
                assert info["episode_start"][i] is not None
                assert 0 in info["final_obs"][i] and info["final_obs"][i][0].shape == (160,)
            if ended >= 4:
                break
        assert ended >= 4


def test_flat_actions_against_a_scripted_bot():
    with CombatVecEnv(num_envs=2, controlled="p0", opponent="scripted:balanced", flat_actions=True, **KW) as env:
        obs, info = env.reset(seed=2)
        assert obs.shape == (2, 1, 160)
        assert info["action_mask"].shape == (2, 1, 36)
        rng = np.random.default_rng(1)
        for _ in range(50):
            obs, reward, terminated, truncated, info = env.step(random_actions(info, rng, True))
            assert reward.shape == (2, 1)


def test_illegal_action_raises_without_changing_state():
    with CombatVecEnv(num_envs=1, controlled="p0", mode_mix={"pvp": 1, "dragon": 0}, **KW) as env:
        _, info = env.reset(seed=3)
        rng = np.random.default_rng(2)
        for _ in range(400):
            if not info["button_mask"][0, 0].all():
                break
            _, _, _, _, info = env.step(random_actions(info, rng, False))
        masked = int(np.flatnonzero(~info["button_mask"][0, 0])[0])
        with pytest.raises(IllegalActionError):
            env.step(np.array([[[0, masked]]]))
        with pytest.raises(IllegalActionError):
            env.step(np.array([[[9, 0]]]))
        env.step(np.array([[[0, 0]]]))


def test_single_env_episode_then_episode_over():
    rules = {"timeLimit": {"duel": 300, "dragonFight": 300}}
    with CombatEnv(rules=rules, **KW) as env:
        obs, info = env.reset(seed=4)
        assert obs.shape == (2, 160)
        rng = np.random.default_rng(3)
        done = False
        steps = 0
        while not done:
            obs, reward, terminated, truncated, info = env.step(random_actions(info, rng, False))
            assert reward.shape == (2,)
            done = terminated or truncated
            steps += 1
        assert steps > 0 and info["outcome"] is not None
        with pytest.raises(RPGBoardEnvError) as exc:
            env.step(np.zeros((2, 2), dtype=np.int64))
        assert exc.value.code == "EPISODE_OVER"


def test_same_seed_same_trajectory():
    def run() -> np.ndarray:
        with CombatVecEnv(num_envs=2, **KW) as env:
            obs, info = env.reset(seed=11)
            rng = np.random.default_rng(5)
            out = [obs]
            for _ in range(60):
                obs, *_rest, info = env.step(random_actions(info, rng, False))
                out.append(obs)
            return np.stack(out)

    assert np.array_equal(run(), run())


def test_version_mismatch():
    with pytest.raises(RPGBoardEnvError) as exc:
        CombatVecEnv(num_envs=1, expect_cobs_version="cobs_v9", **KW)
    assert exc.value.code == "VERSION_MISMATCH"


def test_reset_updates_the_effective_combat_rules_version():
    with PvPCombatEnv(rules={"version": "custom-combat"}, **KW) as env:
        default_hash = env.combat_rules_hash
        env.reset(seed=42)
        assert env.combat_rules_version == "custom-combat"
        assert env.combat_rules_hash != default_hash


def test_missing_build_is_reported(tmp_path):
    os.environ.pop("RPGBOARD_COMBAT_ENV_CMD", None)
    with pytest.raises(RPGBoardEnvError) as exc:
        CombatVecEnv(num_envs=1, cwd=str(tmp_path))
    assert exc.value.code == "SERVER_NOT_BUILT"


def test_describe_names_every_field():
    with CombatEnv(controlled="p0", mode_mix={"pvp": 0, "dragon": 1}, mirror=False, **KW) as env:
        obs, info = env.reset(seed=6)
        d = env.describe(obs[0])
        assert sum(len(v) if isinstance(v, list) else 1 for v in d.values()) == 160
        assert sum(d["self.job"]) == 1.0
        assert d["opp.type"] == [0, 0, 0, 0, 0, 1]
        assert d["dragon.phase"] == [1, 0, 0]
        assert d["g.match"][1] == 1.0
        assert info["active"].tolist() == [True]


@pytest.mark.parametrize("mode", ["mixed", "pvp", "dragon"])
def test_example_loop_runs(mode):
    import subprocess

    env = dict(os.environ, RPGBOARD_COMBAT_ENV_CMD=" ".join(SERVER), RPGBOARD_ROOT=str(ROOT), PYTHONPATH=str(ROOT / "python"))
    res = subprocess.run(
        [sys.executable, str(ROOT / "python/examples/random_combat_agent.py"), "--mode", mode, "--envs", "2", "--steps", "40"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert res.returncode == 0, res.stderr
    assert "decisions=" in res.stdout


@pytest.mark.parametrize(
    ("env_class", "mode", "n_ctrl"),
    [
        (PvPCombatEnv, "pvp", 2),
        (DragonCombatEnv, "dragon", 1),
        (PvPCombatVecEnv, "pvp", 2),
        (DragonCombatVecEnv, "dragon", 1),
    ],
)
def test_named_combat_envs_keep_one_mode_across_reset(env_class, mode, n_ctrl):
    rules = {"timeLimit": {"duel": 12, "dragonFight": 12}}
    kwargs = {"num_envs": 2} if issubclass(env_class, CombatVecEnv) else {}
    with env_class(rules=rules, reward={"k_start": 0}, **kwargs, **KW) as env:
        obs, info = env.reset(seed=27)
        assert env.n_ctrl == n_ctrl
        assert obs.shape[-2:] == (n_ctrl, 160)
        starts = info["episode_start"] if isinstance(env, CombatVecEnv) else [info["episode_start"]]
        assert all(start["mode"] == mode for start in starts)
        finished = 0
        for _ in range(30):
            actions = random_actions(info, np.random.default_rng(1), False)
            obs, reward, terminated, truncated, info = env.step(actions)
            modes = info["mode"] if isinstance(env, CombatVecEnv) else [info["mode"]]
            assert all(value == mode for value in modes)
            assert reward.shape[-1] == n_ctrl
            if isinstance(env, CombatVecEnv):
                for i in np.flatnonzero(terminated | truncated):
                    finished += 1
                    assert info["outcome"][i] is not None
                    assert info["episode_start"][i]["mode"] == mode
                    assert info["final_obs"][i][0].shape == (160,)
                    winner = info["outcome"][i]["winner"]
                    assert reward[i, 0] == (1 if winner == 0 else -1)
                    if mode == "pvp":
                        assert reward[i, 1] == (1 if winner == 1 else -1)
            elif terminated or truncated:
                finished += 1
                assert info["outcome"] is not None
                assert info["final_obs"][0].shape == (160,)
                winner = info["outcome"]["winner"]
                assert reward[0] == (1 if winner == 0 else -1)
                if mode == "pvp":
                    assert reward[1] == (1 if winner == 1 else -1)
                _, next_info = env.reset(seed=28)
                assert next_info["episode_start"]["mode"] == mode
                break
            if finished:
                break
        assert finished > 0


def test_dragon_both_retains_inactive_slot_contract():
    with DragonCombatEnv(controlled="both", **KW) as env:
        obs, info = env.reset(seed=9)
        assert obs.shape == (2, 160)
        assert info["active"].tolist() == [True, False]
        assert not obs[1].any()
        assert info["move_mask"][1].tolist() == [True] + [False] * 8
        assert info["button_mask"][1].tolist() == [True, False, False, False]
        _, reward, _, _, _ = env.step(np.zeros((2, 2), dtype=np.int64))
        assert reward[1] == 0


@pytest.mark.parametrize("env_class", [PvPCombatEnv, DragonCombatEnv])
def test_named_combat_env_rejects_conflicting_mode_mix(env_class):
    with pytest.raises(ValueError, match="mode_mix"):
        env_class(mode_mix={"pvp": 0.5, "dragon": 0.5}, **KW)
