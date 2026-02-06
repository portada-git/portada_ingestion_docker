FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG CACHE_BUST_LIBS=1
# Instal·lem les dependències
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ARG CACHE_BUST_OWN_LIBS=1
# Instal·lem les dependències
COPY own_requirements.txt .
RUN pip install --no-cache-dir -r own_requirements.txt


ARG CACHE_BUST_APP=2
# Copiem l'script del monitor
COPY main_monitor_up.py .

# IMPORTANT: No usem buffer per veure els logs en temps real a Docker
ENV PYTHONUNBUFFERED=1

CMD ["python", "main_monitor_up.py"]
