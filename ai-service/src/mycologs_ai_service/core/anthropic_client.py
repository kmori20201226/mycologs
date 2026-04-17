import anthropic

# Single shared client — instantiated once at import time.
# API key is read automatically from the ANTHROPIC_API_KEY environment variable.
client = anthropic.Anthropic()
