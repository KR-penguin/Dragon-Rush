"""numpy-only client for the Dragon Rush training environment (docs/ai-interface-spec.md §8)."""
from .env import ACT_VERSION, OBS_VERSION, RPGBoardEnv, RPGBoardVecEnv, describe_obs
from .errors import IllegalActionError, RPGBoardEnvError

__version__ = "0.1.0"
__all__ = [
    "ACT_VERSION",
    "OBS_VERSION",
    "RPGBoardEnv",
    "RPGBoardVecEnv",
    "RPGBoardEnvError",
    "IllegalActionError",
    "describe_obs",
]
