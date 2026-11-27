-- 令牌桶（02 §11.3；《完整技术架构》§12.1：rl:tb:{scope}:{id}，Hash，TTL 120 s）。
-- 只用 Redis 7.0 社区版命令（ADR 0011）。时间取自服务端 TIME，避免各实例时钟不一致。
-- KEYS[1] = 桶的键；ARGV[1] = 容量；ARGV[2] = 每秒补充的令牌数；ARGV[3] = 本次消耗；ARGV[4] = 键的 TTL（毫秒）
-- 返回 { allowed(1/0), 剩余令牌（向下取整）, 需要等待的毫秒数（允许时为 0） }
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end

local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + elapsed * rate / 1000)

local allowed = 0
local wait = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  wait = math.ceil((cost - tokens) * 1000 / rate)
end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], ttl)
return { allowed, math.floor(tokens), wait }
