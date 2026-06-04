import os

# The anthropic client is constructed at import time in
# mycologs_ai_service.core.anthropic_client, which raises if no API key is
# present. Set a dummy here BEFORE any agent module is imported. No network is
# ever hit — every test replaces client.messages.create with a fake.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-used")
