-- Insert Vietnam Airports Data
INSERT INTO airports (airport_code, airport_name, city, country) VALUES
('SGN', 'Sân bay quốc tế Tân Sơn Nhất', 'Tp. Hồ Chí Minh', 'Việt Nam'),
('HAN', 'Sân bay quốc tế Nội Bài', 'Hà Nội', 'Việt Nam'),
('DAD', 'Sân bay quốc tế Đà Nẵng', 'Đà Nẵng', 'Việt Nam'),
('CXR', 'Sân bay quốc tế Cam Ranh', 'Khánh Hòa', 'Việt Nam'),
('PQC', 'Sân bay quốc tế Phú Quốc', 'Phú Quốc', 'Việt Nam'),
('VDO', 'Sân bay quốc tế Vân Đồn', 'Quảng Ninh', 'Việt Nam'),
('HUI', 'Sân bay Phú Bài', 'Huế', 'Việt Nam'),
('HPH', 'Sân bay Cát Bi', 'Hải Phòng', 'Việt Nam'),
('VDH', 'Sân bay Đồng Hới', 'Đồng Hới', 'Việt Nam'),
('VII', 'Sân bay Vinh', 'Vinh', 'Việt Nam'),
('THD', 'Sân bay Thọ Xuân', 'Thanh Hóa', 'Việt Nam'),
('DLI', 'Sân bay Liên Khương', 'Đà Lạt', 'Việt Nam'),
('BMV', 'Sân bay Buôn Ma Thuột', 'Buôn Ma Thuột', 'Việt Nam'),
('PLE', 'Sân bay Pleiku', 'Pleiku', 'Việt Nam'),
('UIH', 'Sân bay Phù Cát', 'Quy Nhơn', 'Việt Nam'),
('TBB', 'Sân bay Tuy Hòa', 'Tuy Hòa', 'Việt Nam'),
('VCA', 'Sân bay Cần Thơ', 'Cần Thơ', 'Việt Nam'),
('CAH', 'Sân bay Cà Mau', 'Cà Mau', 'Việt Nam'),
('VKG', 'Sân bay Rạch Giá', 'Rạch Giá', 'Việt Nam'),
('DIN', 'Sân bay Điện Biên Phủ', 'Điện Biên', 'Việt Nam');

-- Insert Sample Airlines
INSERT INTO airlines (airline_code, airline_name, is_active) VALUES
('VN', 'Vietnam Airlines', true),
('VJ', 'VietJet Air', true),
('BL', 'Jetstar Pacific', true),
('QH', 'Bamboo Airways', true);

-- Insert Sample Classes
INSERT INTO new_classes (class_name, day_adv, is_active) VALUES
('Economy', 0, true),
('Premium Economy', 7, true),
('Business', 14, true),
('First Class', 30, true);

