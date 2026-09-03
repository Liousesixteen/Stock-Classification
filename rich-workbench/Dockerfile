FROM python:3.12-alpine
WORKDIR /app
COPY server.py config.json README.md ./
COPY web ./web
RUN mkdir -p private rich-state .runtime && adduser -D rich && chown -R rich:rich /app
USER rich
EXPOSE 8765
CMD ["python", "server.py"]

