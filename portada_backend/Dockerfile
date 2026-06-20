FROM python:3.12-slim

ARG spark_uid=185

RUN groupadd --system --gid=${spark_uid} spark && \
    useradd --system --uid=${spark_uid} --gid=spark -d /home/spark -m spark && \
    mkdir -p /home/spark/; \
    chown -R spark:spark /home/spark

# Install Java (required for PySpark) and git (required for pip install git+)
# Use default-jre-headless which usually points to a compatible version (17 or 21) in recent debian
RUN apt-get update && \
    apt-get install -y default-jre-headless procps git build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install base heavy dependencies first (cached layer)
ARG CACHE_BUST_LIBS=5
COPY portada_backend/requirements-base.txt .
RUN pip install --no-cache-dir --timeout=300 --retries=5 -r requirements-base.txt && \
    rm -rf /root/.cache/pip

# Install application dependencies and the published portada-s-index package.
ARG CACHE_BUST_OWN_LIBS=10
ARG PORTADA_S_INDEX_VERSION=0.2.1
COPY portada_backend/requirements.txt .
# Install PyTorch CPU-only version (much smaller than CUDA version)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir "portada-s-index[all]==${PORTADA_S_INDEX_VERSION}" && \
    pip install --no-cache-dir --timeout=300 --retries=5 -r requirements.txt && \
    rm -rf /root/.cache/pip && \
    find /usr/local/lib/python3.12 -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true && \
    find /usr/local/lib/python3.12 -type f -name "*.pyc" -delete

# Copy source code
COPY portada_backend/. .

# Expose port
EXPOSE 8000

USER spark

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
