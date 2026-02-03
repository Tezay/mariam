import os
import sys
import time

from sqlalchemy import create_engine, text
from flask_migrate import upgrade, stamp

from app import create_app


def env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def acquire_lock(conn, lock_id: int, timeout: int, interval: int) -> None:
    start = time.time()
    while True:
        acquired = conn.execute(
            text("SELECT pg_try_advisory_lock(:id)"),
            {"id": lock_id},
        ).scalar()
        if acquired:
            print("🔒 Migration lock acquired")
            return
        if time.time() - start > timeout:
            print(f"❌ Could not acquire migration lock after {timeout}s", file=sys.stderr)
            sys.exit(1)
        time.sleep(interval)


def release_lock(conn, lock_id: int) -> None:
    conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": lock_id})
    print("🔓 Migration lock released")


def alembic_table_exists(conn) -> bool:
    return conn.execute(text("SELECT to_regclass('public.alembic_version')")).scalar() is not None


def alembic_revision(conn) -> str | None:
    if not alembic_table_exists(conn):
        return None
    return conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar()


def user_table_count(conn) -> int:
    return int(
        conn.execute(
            text(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
                  AND table_name != 'alembic_version'
                """
            )
        ).scalar()
    )


def reset_schema(conn) -> None:
    print("⚠️  Resetting database schema (public)...")
    conn.execute(text("DROP SCHEMA public CASCADE"))
    conn.execute(text("CREATE SCHEMA public"))


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)

    lock_id = int(os.environ.get("MARIAM_MIGRATION_LOCK_ID", "93458231"))
    timeout = int(os.environ.get("MARIAM_MIGRATION_LOCK_TIMEOUT", "60"))
    interval = int(os.environ.get("MARIAM_MIGRATION_LOCK_RETRY", "2"))
    allow_stamp = env_flag("MARIAM_MIGRATION_AUTOSTAMP", False)
    allow_reset = env_flag("MARIAM_DB_RESET", False)

    engine = create_engine(db_url, pool_pre_ping=True)

    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        acquire_lock(conn, lock_id, timeout, interval)

        try:
            if allow_reset:
                reset_schema(conn)

            app = create_app()
            with app.app_context():
                if not allow_reset and alembic_revision(conn) is None:
                    existing_tables = user_table_count(conn)
                    if existing_tables > 0:
                        if allow_stamp:
                            print("ℹ️  Existing schema detected, stamping Alembic head.")
                            stamp()
                        else:
                            print(
                                "❌ Database has tables but no Alembic revision. "
                                "Set MARIAM_MIGRATION_AUTOSTAMP=1 to baseline "
                                "or MARIAM_DB_RESET=1 to reset.",
                                file=sys.stderr,
                            )
                            sys.exit(1)

                upgrade()
        finally:
            release_lock(conn, lock_id)


if __name__ == "__main__":
    main()
