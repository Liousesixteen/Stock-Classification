FROM python:3.11-slim
WORKDIR /engine
COPY upstream/requirements.txt /engine/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . /engine
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python", "/engine/bridge.py"]
