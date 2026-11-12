"""Plays combat episodes with a masked random two-head policy. Replace `act` with your numpy Actor-Critic.

Usage (from the repo root, after `pnpm install && pnpm build` and `pip install -e python/`):
    python python/examples/random_combat_agent.py --mode pvp --envs 16 --steps 2000
    python python/examples/random_combat_agent.py --mode pvp --p0 --opponent scripted:balanced
    python python/examples/random_combat_agent.py --mode dragon --envs 16 --steps 2000
"""
from __future__ import annotations

import argparse
import time
from collections import Counter

import numpy as np

from rpgboard_env import CombatVecEnv, DragonCombatVecEnv, PvPCombatVecEnv


def masked_sample(logits: np.ndarray, mask: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """One sample per row of softmax(logits) restricted to mask == True (Gumbel-max, vectorised)."""
    g = rng.gumbel(size=logits.shape)
    return np.argmax(np.where(mask, logits + g, -np.inf), axis=-1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--envs", type=int, default=16)
    parser.add_argument("--steps", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--mode", choices=("mixed", "pvp", "dragon"), default="mixed")
    parser.add_argument("--opponent", default="scripted:pool", help="used with --p0")
    parser.add_argument("--p0", action="store_true", help="control fighter a only in PvP/mixed, against a scripted bot")
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    if args.mode == "dragon":
        env = DragonCombatVecEnv(num_envs=args.envs)
    else:
        env_class = PvPCombatVecEnv if args.mode == "pvp" else CombatVecEnv
        env = env_class(num_envs=args.envs, controlled="p0" if args.p0 else "both", opponent=args.opponent)
    with env:
        # a linear "actor" with two heads: 9 move logits + 4 button logits
        w = rng.normal(0.0, 0.01, (env.obs_dim, sum(env.action_nvec))).astype(np.float32)
        obs, info = env.reset(seed=args.seed)
        outcomes: Counter[str] = Counter()
        returns = np.zeros((args.envs, env.n_ctrl), dtype=np.float64)
        finished: list[float] = []
        kept = decisions = 0
        started = time.perf_counter()
        for _ in range(args.steps):
            logits = obs @ w                                            # (N, n_ctrl, 13)
            move = masked_sample(logits[..., :9], info["move_mask"], rng)
            button = masked_sample(logits[..., 9:], info["button_mask"], rng)
            # steps with actionable == False are ignored by the env: a trainer skips them and adds
            # their reward to the next stored step (discount gamma ** (ticks_elapsed / 4))
            kept += int((info["actionable"] & info["active"]).sum())
            decisions += int(info["active"].sum())
            obs, reward, terminated, truncated, info = env.step(np.stack([move, button], axis=-1))
            returns += reward
            for i in np.flatnonzero(terminated | truncated):
                o = info["outcome"][i]
                outcomes[f"{o['reason']}:{'dragon' if o['winner'] == 'dragon' else 'fighter'}"] += 1
                finished.append(float(returns[i, 0]))
                returns[i] = 0.0
        elapsed = time.perf_counter() - started
    print(f"decisions={decisions} ({decisions / elapsed:.0f}/s), actionable share={kept / max(1, decisions):.2f}")
    print(f"episodes={len(finished)} slot-0 mean return={np.mean(finished) if finished else 0:+.3f} outcomes={dict(outcomes)}")


if __name__ == "__main__":
    main()
