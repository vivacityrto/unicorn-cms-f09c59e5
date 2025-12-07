-- Add M-DR and M-DC packages if they don't exist
INSERT INTO packages (name, full_text, details, status, slug)
SELECT 'M-DR', 'Diamond RTO Membership', 'Membership gives them 112 hours to use with Vivacity over a year, including consult time with a client success champion, access to VIV training and all UNICORN docs', 'active', '/package-m-dr'
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'M-DR');

INSERT INTO packages (name, full_text, details, status, slug)
SELECT 'M-DC', 'Diamond CRICOS Membership', 'Membership gives them 126 hours to use with Vivacity over a year, including consult time with a client success champion, access to VIV training and all UNICORN docs for RTO and CRICOS', 'active', '/package-m-dc'
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'M-DC');