from fastapi import TestClient_factory


def TestClient(app):
    return TestClient_factory(app)
