"""Supported GPU Economy model IDs. Only H100 SXM has a fixed benchmark basket."""

from typing import Literal

MarketId = Literal[
    "h100-sxm", "a100-80", "b200", "h200", "b300", "l40s", "l40", "l4",
    "a10", "t4", "rtx-pro-6000", "rtx-6000-ada", "rtx-a6000", "rtx-5090",
    "rtx-4090", "a100-40",
]

# Hardware specifications: NVIDIA product briefs. Rental observations are fetched
# independently from each model's GPU Economy feed, never seeded from these specs.
SPECS: dict[str, dict[str, str]] = {
    "h100-sxm": dict(name="H100", architecture="Hopper", memory="80 GB HBM3", color="purple"),
    "a100-80": dict(name="A100", architecture="Ampere", memory="80 GB HBM2e", color="gold"),
    "b200": dict(name="B200", architecture="Blackwell", memory="180 GB HBM3e", color="green"),
    "h200": dict(name="H200", architecture="Hopper", memory="141 GB HBM3e", color="purple"),
    "b300": dict(name="B300", architecture="Blackwell Ultra", memory="288 GB HBM3e", color="green"),
    "l40s": dict(name="L40S", architecture="Ada Lovelace", memory="48 GB GDDR6", color="gold"),
    "l40": dict(name="L40", architecture="Ada Lovelace", memory="48 GB GDDR6", color="gold"),
    "l4": dict(name="L4", architecture="Ada Lovelace", memory="24 GB GDDR6", color="gold"),
    "a10": dict(name="A10", architecture="Ampere", memory="24 GB GDDR6", color="gold"),
    "t4": dict(name="T4", architecture="Turing", memory="16 GB GDDR6", color="green"),
    "rtx-pro-6000": dict(name="RTX PRO 6000", architecture="Blackwell", memory="96 GB GDDR7", color="green"),
    "rtx-6000-ada": dict(name="RTX 6000 Ada", architecture="Ada Lovelace", memory="48 GB GDDR6", color="gold"),
    "rtx-a6000": dict(name="RTX A6000", architecture="Ampere", memory="48 GB GDDR6", color="gold"),
    "rtx-5090": dict(name="RTX 5090", architecture="Blackwell", memory="32 GB GDDR7", color="green"),
    "rtx-4090": dict(name="RTX 4090", architecture="Ada Lovelace", memory="24 GB GDDR6X", color="gold"),
    "a100-40": dict(name="A100 40GB", architecture="Ampere", memory="40 GB HBM2", color="gold"),
}
