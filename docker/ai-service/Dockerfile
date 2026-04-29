FROM python:3.11-slim
WORKDIR /app

COPY ai-service/pyproject.toml ./
COPY ai-service/src/ ./src/
RUN pip install --no-cache-dir .

EXPOSE 3002
CMD ["python", "-m", "mycologs_ai_service", "--host", "0.0.0.0", "--port", "3002"]
