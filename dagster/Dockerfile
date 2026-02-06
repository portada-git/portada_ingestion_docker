FROM apache/spark:3.5.3
ENV DEBIAN_FRONTEND=noninteractive

USER root

# 1. Actualitzem i instal·lem les dependències necessàries per COMPILAR Python
# Quests llibreries tenen noms estàndard a Debian/Ubuntu
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libncurses5-dev \
    libncursesw5-dev \
    libreadline-dev \
    libsqlite3-dev \
    libgdbm-dev \
    libdb5.3-dev \
    libbz2-dev \
    libexpat1-dev \
    liblzma-dev \
    libffi-dev \
    uuid-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# 2. Descarreguem i compilem Python 3.12.1 (versió estable)
WORKDIR /tmp
RUN wget https://www.python.org/ftp/python/3.12.1/Python-3.12.1.tgz && \
    tar -xvf Python-3.12.1.tgz && \
    cd Python-3.12.1 && \
    ./configure --enable-optimizations --prefix=/usr && \
    make -j 4 && \
    make install && \
    cd .. && rm -rf Python-3.12.1 Python-3.12.1.tgz

# 3. Assegurem que pip està actualitzat
RUN python3.12 -m pip install --upgrade pip

# 4. Configurem Spark per fer servir la nova versió 3.12
# Com que hem compilat amb prefix=/usr, l'executable és a /usr/bin/python3.12
ENV PYSPARK_PYTHON=/usr/bin/python3.12
ENV PYSPARK_DRIVER_PYTHON=/usr/bin/python3.12

# Assegurar python apunta a python3.12
RUN ln -sf /usr/bin/python3.12 /usr/bin/python3

# Canviar aquest número per forçar la descàrrega de GitHub
ARG CACHE_BUST_LIBS=2
# Instal·lem les dependències
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ARG CACHE_BUST_OWN_LIBS=8
# Instal·lem les dependències
COPY own_requirements.txt .
RUN pip install --no-cache-dir -r own_requirements.txt


# Afegim-la al PYTHONPATH perquè el script la trobi
ENV PYTHONPATH="/opt/libs:${PYTHONPATH}"

# Creem les carpetes de treball de Spark i Ivy i les fem propietat de l'usuari spark
RUN mkdir -p /home/spark/.ivy2/cache /home/spark/.ivy2/jars && \
    chown -R spark:spark /home/spark && \
    chmod -R 775 /home/spark

RUN mkdir -p /opt/dagster/dagster_home && \
    chown -R spark:spark /opt/dagster/dagster_home && \
    chmod -R 775 /opt/dagster/dagster_home
    
# Per escriure logs o dades a /opt/spark
RUN chown -R spark:spark /opt/spark

USER spark

ARG CACHE_BUST_APP=1

ENV DAGSTER_HOME=/opt/dagster/dagster_home

WORKDIR /opt/dagster/app

# Copiem la configuració i el codi
COPY dagster.yaml $DAGSTER_HOME/
COPY workspace.yaml .
COPY definitions.py .

EXPOSE 3000
