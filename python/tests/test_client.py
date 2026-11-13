import os
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from rpgboard_env import IllegalActionError, RPGBoardEnv, RPGBoardEnvError, RPGBoardVecEnv  # noqa: E402

SERVER = ["node", "--import", "tsx", "packages/sim/src/env-server.ts"]
KW = dict(server_cmd=SERVER, cwd=str(ROOT))


def test_single_env_shapes_and_episode():
    with RPGBoardEnv(num_players=3, max_rounds=60, **KW) as env:
        assert env.obs_version == "obs_v5" and env.act_version == "act_v4"
        assert env.obs_dim == 498 and env.action_dim == 44
        obs, info = env.reset(seed=1)
        assert obs.shape == (498,) and obs.dtype == np.float32
        assert info["action_mask"].shape == (44,) and info["action_mask"].dtype == bool
        rng = np.random.default_rng(0)
        done, steps = False, 0
        while not done:
            action = int(rng.choice(np.flatnonzero(info["action_mask"])))
            obs, reward, terminated, truncated, info = env.step(action)
            assert isinstance(reward, float)
            done = terminated or truncated
            steps += 1
        assert steps > 0
        assert not info["action_mask"].any()


def test_illegal_action_raises_without_changing_state():
    with RPGBoardEnv(**KW) as env:
        _, info = env.reset(seed=2)
        illegal = int(np.flatnonzero(~info["action_mask"])[0])
        with pytest.raises(IllegalActionError):
            env.step(illegal)
        env.step(int(np.flatnonzero(info["action_mask"])[0]))


def test_vec_env_selfplay_rewards():
    with RPGBoardVecEnv(num_envs=4, mode="selfplay", num_players=[2, 4], **KW) as env:
        obs, info = env.reset(seed=3)
        assert obs.shape == (4, 498)
        assert info["action_mask"].shape == (4, 44)
        rng = np.random.default_rng(1)
        for _ in range(300):
            actions = [int(rng.choice(np.flatnonzero(m))) for m in info["action_mask"]]
            obs, reward, terminated, truncated, info = env.step(actions)
            assert reward.shape == (4, 4)
            assert terminated.shape == (4,)


def test_same_seed_same_trajectory():
    def run():
        with RPGBoardEnv(**KW) as env:
            obs, info = env.reset(seed=11)
            out = [obs]
            for _ in range(50):
                obs, _, term, trunc, info = env.step(int(np.flatnonzero(info["action_mask"])[0]))
                out.append(obs)
                if term or trunc:
                    break
            return np.stack(out)

    assert np.array_equal(run(), run())


@pytest.mark.parametrize("expected", [
    {"expect_obs_version": "obs_v3"},
    {"expect_act_version": "act_v2"},
    {"expect_obs_version": "obs_v9"},
])
def test_version_mismatch(expected):
    with pytest.raises(RPGBoardEnvError) as exc:
        RPGBoardEnv(**{**KW, **expected})
    assert exc.value.code == "VERSION_MISMATCH"


def test_missing_build_is_reported(tmp_path):
    os.environ.pop("RPGBOARD_ENV_CMD", None)
    with pytest.raises(RPGBoardEnvError) as exc:
        RPGBoardEnv(cwd=str(tmp_path))
    assert exc.value.code == "SERVER_NOT_BUILT"


def test_describe_names_every_field():
    with RPGBoardEnv(num_players=2, **KW) as env:
        obs, _ = env.reset(seed=4)
        d = env.describe(obs)
        assert len(d["self.job"]) == 5 and sum(d["self.job"]) == 1.0
        assert d["self.coins"] == pytest.approx(10 / 50)
        assert d["opp1.present"] == 1.0 and d["opp2.present"] == 0.0
        assert len(d["g.dice"]) == 10
        assert d["tile00.coins"] == 0.0
        assert -2 <= d["tile01.coins"] <= 2
        assert d["tile06.shop"] == 1.0
        assert sum(len(v) if isinstance(v, list) else 1 for v in d.values()) == 498
