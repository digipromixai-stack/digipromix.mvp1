# Production crawler image — uses Microsoft's official Playwright Python image
# so Chromium + every system dependency is pre-installed. No more "Executable
# doesn't exist" errors at runtime.
FROM mcr.microsoft.com/playwright/python:v1.43.0-jammy

# Run as the non-root pwuser baked into the base image
WORKDIR /app

# Install Python deps first so they cache between code-only rebuilds
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of the source
COPY . .

# Render injects $PORT; default to 8000 for local docker run
ENV PORT=8000 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 8000

# Use shell form so $PORT expands at runtime
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
