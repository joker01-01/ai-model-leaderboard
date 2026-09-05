FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --create-home --shell /usr/sbin/nologin appuser

WORKDIR /opt/modelops

COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/app backend/app

RUN python -m pip install --no-cache-dir ./backend

COPY data/modelops/generated data/modelops/generated
COPY data/aa/generated/snapshot.json data/aa/generated/snapshot.json
COPY data/aa/official-sources.json data/aa/official-sources.json

USER 10001:10001
WORKDIR /opt/modelops/backend

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/healthz', timeout=3)"

CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8080}\" --workers 1 --no-proxy-headers"]
