FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .

EXPOSE 5000

# 4 workers async — suficiente para 40+ usuarios simultaneos
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "4", "--proxy-headers", "--forwarded-allow-ips=*"]
