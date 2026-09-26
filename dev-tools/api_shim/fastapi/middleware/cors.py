class CORSMiddleware:
    """No-op stand-in — CORS is a browser-enforced concept, irrelevant to a
    server-side test harness that calls route functions directly."""
    def __init__(self, *args, **kwargs):
        pass
