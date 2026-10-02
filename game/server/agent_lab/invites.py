"""Run manually on the server: python -m agent_lab.invites --days 30."""
import argparse

from .config import Settings
from .store import Store


def main():
    parser = argparse.ArgumentParser(description="Create a single-use, random Agent Lab invitation.")
    parser.add_argument("--days", type=int, default=30, help="Invitation redemption validity, 1-365 days")
    args = parser.parse_args()
    if not 1 <= args.days <= 365:
        parser.error("--days must be 1-365")
    store = Store(Settings.from_env())
    store.initialize()
    print(store.create_invite(args.days))


if __name__ == "__main__":
    main()
