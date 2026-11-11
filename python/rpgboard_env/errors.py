class RPGBoardEnvError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class IllegalActionError(RPGBoardEnvError):
    """The env server rejected an action; no env state changed."""
