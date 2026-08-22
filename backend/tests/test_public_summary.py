from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_public_summary_endpoint():
    """Verify that unauthenticated visitors can fetch the public market overview."""
    response = client.get("/api/public/summary")
    assert response.status_code == 200
    data = response.json()

    # Core structure checks
    assert "nifty" in data
    assert "market_breadth" in data
    assert "top_gainers" in data
    assert "top_losers" in data
    assert "system_stats" in data

    # Confidentiality check: no private broker token or internal credentials leaked
    assert "access_token" not in data
    assert "fyers" not in data
    assert "paper_orders" not in data
