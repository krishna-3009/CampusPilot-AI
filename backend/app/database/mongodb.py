
import os
from pathlib import Path

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise ValueError("MONGO_URI is missing")

client = MongoClient(
    MONGO_URI,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=20000
)

db = client["campuspilot"]

users_collection = db["users"]
documents_collection = db["documents"]
