import pytest
from app import aliceblue_auth
from app.aliceblue_service import AliceBlueContractMaster, AliceBlueDataEngine


def test_contract_master_token_lookup():
    cm = AliceBlueContractMaster()
    assert cm.load_contracts() is True
    assert cm.get_token("RELIANCE") == 2885
    assert cm.get_token("TCS") == 11536
    assert cm.get_token("NIFTY50") == 26000
    assert cm.get_symbol(2885) == "RELIANCE"
    assert cm.get_symbol(26000) == "NIFTY50"


def test_aliceblue_jwt_validation():
    # Invalid token string
    assert aliceblue_auth.is_token_valid("invalid.token") is False
    assert aliceblue_auth.is_token_valid("") is False


def test_aliceblue_login_url():
    url = aliceblue_auth.build_login_url()
    assert "https://ant.aliceblueonline.com/?appcode=" in url
    assert "X926u86ZC6" in url


def test_aliceblue_tick_handling():
    engine = AliceBlueDataEngine()
    engine.contract_master.load_contracts()

    # Simulate tick for RELIANCE
    tick_data = {
        "tk": 2885,
        "lp": 2950.50,
        "h": 2965.0,
        "l": 2940.0,
        "c": 2930.0,
        "v": 1500000,
        "uc": 3200.0,
        "lc": 2650.0,
        "tbq": 50000,
        "tsq": 45000,
    }
    engine._handle_tick(tick_data)
    assert engine.tick_count == 1

def test_aliceblue_crypto_and_totp():
    # Test CryptoJS-compatible password encryption
    pwd = "TestPassword123"
    enc_key = "SAMPLE_ENC_KEY_123"
    enc1 = aliceblue_auth._encrypt_password_cryptojs(pwd, enc_key)
    assert enc1.startswith("U2FsdGVkX1")  # Standard "Salted__" OpenSSL header in base64

    # Test TOTP generation
    secret = "JBSWY3DPEHPK3PXP"
    totp = aliceblue_auth.generate_totp(secret)
    assert len(totp) == 6
    assert totp.isdigit()

