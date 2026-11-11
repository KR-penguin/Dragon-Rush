"""Plays episodes with a masked random policy. Replace `policy` with your numpy Actor-Critic.

Usage (from the repo root, after `pnpm install && pnpm build` and `pip install -e python/`):
    python python/examples/random_agent.py --episodes 100
"""
from __future__ import annotations

import argparse
import time
from collections import Counter

import numpy as np

from rpgboard_env import RPGBoardEnv


def masked_softmax(logits: np.ndarray, mask: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = np.where(mask, logits / temperature, -np.inf)
    p = np.exp(z - z.max())
    return p / p.sum()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", type=int, default=20)
    parser.add_argument("--players", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    outcomes: Counter[str] = Counter()
    steps = 0
    started = time.perf_counter()
    with RPGBoardEnv(mode="single", num_players=args.players, opponents="heuristic", max_rounds=100) as env:
        weights = rng.normal(0.0, 0.01, (env.obs_dim, env.action_dim)).astype(np.float32)
        total_return = 0.0
        for episode in range(args.episodes):
            obs, info = env.reset(seed=args.seed * 100_000 + episode)
            done = False
            while not done:
                probs = masked_softmax(obs @ weights, info["action_mask"])
                action = int(rng.choice(env.action_dim, p=probs))
                obs, reward, terminated, truncated, info = env.step(action)
                total_return += reward
                steps += 1
                done = terminated or truncated
            outcome = info["outcome"]
            outcomes["eliminated" if outcome is None else outcome["kind"]] += 1
    elapsed = time.perf_counter() - started
    print(f"episodes={args.episodes} steps={steps} ({steps / elapsed:.0f} steps/s)")
    print(f"mean return={total_return / args.episodes:+.3f} outcomes={dict(outcomes)}")


if __name__ == "__main__":
    main()
