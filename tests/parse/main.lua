for i = 1, 5 do
	os.execute("sleep 1")
	print("foo" .. i)
end

print("{") --Stalls future output unless message is pushed (like hitting a breakpoint)

for i = 1, 5 do
	os.execute("sleep 1")
	print("bar" .. i)
end

print("{method = \"test\"}")
print("{{}}")

print('{"')
local x = 1 --Make sure a breakpoint here will hit

for i = 1, 5 do
	os.execute("sleep 1")
	print("baz" .. i)
end
