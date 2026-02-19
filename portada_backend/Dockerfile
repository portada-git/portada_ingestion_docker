FROM python:3.12-slim

ARG spark_uid=185

RUN groupadd --system --gid=${spark_uid} spark && \
    useradd --system --uid=${spark_uid} --gid=spark -d /home/spark -m spark && \
    mkdir -p /home/spark/; \
    chown -R spark:spark /home/spark

# Install Java (required for PySpark) and git (required for pip install git+)
# Use default-jre-headless which usually points to a compatible version (17 or 21) in recent debian
RUN apt-get update && \
    apt-get install -y default-jre-headless procps git && \
    apt-get clean;

WORKDIR /app

# Install base heavy dependencies first (cached layer)
ARG CACHE_BUST_LIBS=5
COPY requirements-base.txt .
RUN pip install --no-cache-dir -r requirements-base.txt

# Install application dependencies (including git repo)
ARG CACHE_BUST_OWN_LIBS=10
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 8000

USER spark

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
