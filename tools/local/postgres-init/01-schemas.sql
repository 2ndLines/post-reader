-- 首次初始化数据卷时执行（docker-entrypoint-initdb.d）；测试台架使用独立 schema（04 §3）
CREATE SCHEMA IF NOT EXISTS testbench AUTHORIZATION reader;
