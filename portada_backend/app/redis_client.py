
import redis
import os

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

class RedisClient:
    _instance = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        return cls._instance

def get_redis():
    return RedisClient.get_instance()
