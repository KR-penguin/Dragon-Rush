"""numpy-only clients for the Dragon Rush training environments.

Board model: RPGBoardEnv / RPGBoardVecEnv (docs/ai-interface-spec.md §8).
Combat model: CombatEnv / CombatVecEnv (docs/combat-ai-spec.md §9).
"""
from .combat import CACT_VERSION, COBS_VERSION, CombatEnv, CombatVecEnv
from .env import ACT_VERSION, OBS_VERSION, RPGBoardEnv, RPGBoardVecEnv, describe_obs
from .errors import IllegalActionError, RPGBoardEnvError

__version__ = "0.2.0"
__all__ = [
    "ACT_VERSION",
    "OBS_VERSION",
    "CACT_VERSION",
    "COBS_VERSION",
    "RPGBoardEnv",
    "RPGBoardVecEnv",
    "CombatEnv",
    "CombatVecEnv",
    "RPGBoardEnvError",
    "IllegalActionError",
    "describe_obs",
]
