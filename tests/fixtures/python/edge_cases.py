"""
Edge case patterns for Python validator testing.

Tests uncommon but valid Python constructs:
- Metaclasses
- Property decorators with setters/deleters
- __slots__
- Future imports
- Conditional imports
- Walrus operator
- Complex decorators
- String edge cases (code-like content)
"""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING, Any, Dict, List, Optional, TypeVar

# Conditional imports based on platform
if sys.platform == "win32":
    import winreg  # type: ignore
else:
    import pwd  # type: ignore

# TYPE_CHECKING imports (should still be detected)
if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Protocol

T = TypeVar("T")


# =============================================================================
# Metaclasses
# =============================================================================


class SingletonMeta(type):
    """Metaclass that creates singleton instances."""

    _instances: Dict[type, Any] = {}

    def __call__(cls, *args: Any, **kwargs: Any) -> Any:
        if cls not in cls._instances:
            cls._instances[cls] = super().__call__(*args, **kwargs)
        return cls._instances[cls]


class Singleton(metaclass=SingletonMeta):
    """A singleton class using metaclass."""

    def __init__(self) -> None:
        self.value: Optional[str] = None


class RegistryMeta(type):
    """Metaclass that registers all subclasses."""

    registry: Dict[str, type] = {}

    def __new__(
        mcs,
        name: str,
        bases: tuple,
        namespace: dict,
        **kwargs: Any,
    ) -> type:
        cls = super().__new__(mcs, name, bases, namespace)
        if name != "RegisteredBase":
            mcs.registry[name] = cls
        return cls


class RegisteredBase(metaclass=RegistryMeta):
    """Base class that auto-registers subclasses."""

    pass


class PluginA(RegisteredBase):
    """Plugin A - auto-registered."""

    pass


class PluginB(RegisteredBase):
    """Plugin B - auto-registered."""

    pass


# =============================================================================
# Property Decorators
# =============================================================================


class Temperature:
    """Class demonstrating full property protocol."""

    def __init__(self, celsius: float = 0.0) -> None:
        self._celsius = celsius

    @property
    def celsius(self) -> float:
        """Get temperature in Celsius."""
        return self._celsius

    @celsius.setter
    def celsius(self, value: float) -> None:
        """Set temperature in Celsius."""
        if value < -273.15:
            raise ValueError("Temperature below absolute zero")
        self._celsius = value

    @celsius.deleter
    def celsius(self) -> None:
        """Reset temperature to zero."""
        self._celsius = 0.0

    @property
    def fahrenheit(self) -> float:
        """Get temperature in Fahrenheit."""
        return self._celsius * 9 / 5 + 32

    @fahrenheit.setter
    def fahrenheit(self, value: float) -> None:
        """Set temperature in Fahrenheit."""
        self.celsius = (value - 32) * 5 / 9


# =============================================================================
# __slots__
# =============================================================================


class SlottedPoint:
    """Memory-efficient point class using __slots__."""

    __slots__ = ["x", "y", "_name"]

    def __init__(self, x: float, y: float, name: str = "") -> None:
        self.x = x
        self.y = y
        self._name = name

    def distance(self, other: SlottedPoint) -> float:
        """Calculate distance to another point."""
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5


class SlottedInherited(SlottedPoint):
    """Inherited class with additional slots."""

    __slots__ = ["z"]

    def __init__(self, x: float, y: float, z: float) -> None:
        super().__init__(x, y)
        self.z = z


# =============================================================================
# Walrus Operator
# =============================================================================


def process_with_walrus(data: List[int]) -> List[int]:
    """Function using walrus operator."""
    results: List[int] = []

    # Walrus in while loop
    index = 0
    while (value := data[index] if index < len(data) else None) is not None:
        if (doubled := value * 2) > 10:
            results.append(doubled)
        index += 1

    # Walrus in list comprehension
    return [y for x in results if (y := x + 1) > 0]


def find_match(items: List[str], pattern: str) -> Optional[str]:
    """Find first matching item using walrus."""
    import re

    for item in items:
        if (match := re.search(pattern, item)):
            return match.group(0)
    return None


# =============================================================================
# Complex Decorators
# =============================================================================


def repeat(times: int):
    """Decorator factory that repeats function calls."""

    def decorator(func):
        def wrapper(*args, **kwargs):
            result = None
            for _ in range(times):
                result = func(*args, **kwargs)
            return result

        return wrapper

    return decorator


def validate_args(*validators):
    """Decorator that validates arguments."""

    def decorator(func):
        def wrapper(*args, **kwargs):
            for i, (arg, validator) in enumerate(zip(args, validators)):
                if not validator(arg):
                    raise ValueError(f"Argument {i} failed validation")
            return func(*args, **kwargs)

        return wrapper

    return decorator


def deprecated(reason: str = "", replacement: str = ""):
    """Decorator marking functions as deprecated."""
    import warnings

    def decorator(func):
        msg = f"{func.__name__} is deprecated"
        if reason:
            msg += f": {reason}"
        if replacement:
            msg += f". Use {replacement} instead"

        def wrapper(*args, **kwargs):
            warnings.warn(msg, DeprecationWarning, stacklevel=2)
            return func(*args, **kwargs)

        return wrapper

    return decorator


@repeat(3)
@validate_args(lambda x: x > 0, lambda y: isinstance(y, str))
def complex_decorated(count: int, name: str) -> str:
    """Function with multiple stacked decorators."""
    return f"{name}: {count}"


@deprecated(reason="Old API", replacement="new_function")
def old_function() -> None:
    """Deprecated function."""
    pass


# =============================================================================
# String Edge Cases (code-like content that shouldn't be parsed)
# =============================================================================


CODE_EXAMPLE = """
class FakeClass:
    def fake_method(self):
        import fake_module
        return fake_module.fake_function()
"""

SQL_QUERY = """
SELECT id, name, email
FROM users
WHERE status = 'active'
  AND created_at > '2024-01-01'
ORDER BY name ASC
"""

REGEX_PATTERN = r"def\s+(\w+)\s*\((.*?)\):"

MULTILINE_STRING = """This is a
multiline string with
import statements and
class definitions that
should NOT be parsed as code."""


def get_code_template() -> str:
    """Return code template (shouldn't affect parsing)."""
    return f"""
def generated_function():
    return {CODE_EXAMPLE!r}
"""


# =============================================================================
# Conditional Class Definition
# =============================================================================


if sys.version_info >= (3, 10):
    # Match statement (Python 3.10+)
    def process_command(command: str) -> str:
        match command.split():
            case ["quit"]:
                return "Exiting"
            case ["hello", name]:
                return f"Hello, {name}"
            case ["add", *numbers]:
                return str(sum(int(n) for n in numbers))
            case _:
                return "Unknown command"


# =============================================================================
# Positional-only and Keyword-only Parameters
# =============================================================================


def mixed_params(
    pos_only: int,
    /,
    normal: str,
    *args: int,
    kw_only: bool = False,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Function with all parameter types."""
    return {
        "pos_only": pos_only,
        "normal": normal,
        "args": args,
        "kw_only": kw_only,
        "kwargs": kwargs,
    }


# =============================================================================
# Complex Type Hints
# =============================================================================


from typing import Callable, Literal, Union

# Type aliases
JsonValue = Union[str, int, float, bool, None, List["JsonValue"], Dict[str, "JsonValue"]]
Handler = Callable[[str, Dict[str, Any]], Optional[str]]
Status = Literal["pending", "running", "completed", "failed"]


def process_json(
    data: JsonValue,
    handler: Handler,
    status: Status = "pending",
) -> Optional[JsonValue]:
    """Process JSON with complex type hints."""
    if isinstance(data, dict):
        result = handler(str(data), data)
        return {"result": result, "status": status}
    return data


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "SingletonMeta",
    "Singleton",
    "RegistryMeta",
    "RegisteredBase",
    "Temperature",
    "SlottedPoint",
    "SlottedInherited",
    "process_with_walrus",
    "find_match",
    "repeat",
    "validate_args",
    "deprecated",
    "complex_decorated",
    "mixed_params",
    "process_json",
]
