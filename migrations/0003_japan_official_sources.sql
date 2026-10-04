INSERT OR IGNORE INTO sources (id,name,url,kind,region,language,trust_tier) VALUES
('svt-japan-schedule','SEVENTEEN 日本官網行程','https://www.seventeen-17.jp/posts/schedule','html','JP','ja',1),
('svt-japan-discography','SEVENTEEN 日本官網作品','https://www.seventeen-17.jp/posts/discography','html','JP','ja',1),
('svt-japan-cheer','SEVENTEEN 日本官網應援方法','https://www.seventeen-17.jp/posts/call','html','JP','ja',1);

UPDATE sources SET name='SEVENTEEN 日本官網新聞' WHERE id='svt-japan';
