"""JSON Lines transport to the Node env server (stdin/stdout)."""
from __future__ import annotations

import json
import os
import queue
import shlex
import subprocess
import threading
from pathlib import Path
from typing import Any, Sequence

from .errors import IllegalActionError, RPGBoardEnvError

DEFAULT_SERVER = ["node", "packages/sim/dist/env-server.js"]


def repo_root(cwd: str | os.PathLike[str] | None = None) -> Path:
    if cwd is not None:
        return Path(cwd)
    env_root = os.environ.get("RPGBOARD_ROOT")
    if env_root:
        return Path(env_root)
    return Path(__file__).resolve().parents[2]


def resolve_command(
    server_cmd: str | Sequence[str] | None,
    default: Sequence[str] = DEFAULT_SERVER,
    env_var: str = "RPGBOARD_ENV_CMD",
) -> tuple[list[str], bool]:
    """Returns (command, is_default)."""
    if server_cmd is None:
        server_cmd = os.environ.get(env_var)
    if server_cmd is None:
        return list(default), True
    if isinstance(server_cmd, str):
        return shlex.split(server_cmd, posix=os.name != "nt"), False
    return list(server_cmd), False


class ServerProcess:
    def __init__(
        self,
        server_cmd: str | Sequence[str] | None,
        cwd: str | os.PathLike[str] | None,
        timeout: float,
        default: Sequence[str] = DEFAULT_SERVER,
        env_var: str = "RPGBOARD_ENV_CMD",
    ) -> None:
        root = repo_root(cwd)
        cmd, is_default = resolve_command(server_cmd, default, env_var)
        if is_default and not (root / default[1]).exists():
            raise RPGBoardEnvError(
                "SERVER_NOT_BUILT",
                f"{root / default[1]} not found. Run `pnpm install && pnpm build` in {root}.",
            )
        self.timeout = timeout
        self._next_id = 0
        self._proc = subprocess.Popen(
            cmd,
            cwd=str(root),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._reader = threading.Thread(target=self._read, daemon=True)
        self._reader.start()

    def _read(self) -> None:
        assert self._proc.stdout is not None
        for line in self._proc.stdout:
            self._lines.put(line)
        self._lines.put(None)

    def call(self, cmd: str, params: dict[str, Any] | None = None) -> Any:
        if self._proc.poll() is not None:
            raise RPGBoardEnvError("INTERNAL", f"env server exited with code {self._proc.returncode}")
        self._next_id += 1
        req: dict[str, Any] = {"id": self._next_id, "cmd": cmd}
        if params is not None:
            req["params"] = params
        assert self._proc.stdin is not None
        self._proc.stdin.write(json.dumps(req, separators=(",", ":")) + "\n")
        self._proc.stdin.flush()
        try:
            line = self._lines.get(timeout=self.timeout)
        except queue.Empty as exc:
            raise RPGBoardEnvError("TIMEOUT", f"no response to {cmd} within {self.timeout}s") from exc
        if line is None:
            raise RPGBoardEnvError("INTERNAL", "env server closed the connection")
        res = json.loads(line)
        if res.get("id") != self._next_id:
            raise RPGBoardEnvError("INTERNAL", f"response id {res.get('id')} != {self._next_id}")
        if not res["ok"]:
            err = res["error"]
            cls = IllegalActionError if err["code"] == "ILLEGAL_ACTION" else RPGBoardEnvError
            raise cls(err["code"], err["message"])
        return res["result"]

    def close(self) -> None:
        if self._proc.poll() is None:
            try:
                self.call("close")
            except RPGBoardEnvError:
                pass
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        for stream in (self._proc.stdin, self._proc.stdout):
            if stream:
                stream.close()
