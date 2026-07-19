"""Dedicated worker process for scheduled background jobs.

The web (gunicorn) workers never run the scheduler; this single process does, so
scheduled push notifications are sent exactly once. Started by the compose
`scheduler` service with ENABLE_SCHEDULER=1.
"""
import os
import time

from app import create_app

# Ensure the scheduler is enabled even if the env var was not set on the service.
os.environ.setdefault('ENABLE_SCHEDULER', '1')

app = create_app()

if __name__ == '__main__':
    app.logger.info('Scheduler process started')
    # create_app() starts the BackgroundScheduler (daemon thread); keep the main
    # thread alive so the process does not exit.
    while True:
        time.sleep(3600)
