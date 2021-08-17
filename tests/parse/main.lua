--Test control codes: make sure his can be inspected
local c1 = "\0\1\2\3\4\5\6\7\8\9\10\11\12\13\14\15\16\17\18\19\20\21\22\23\24\25\26\27\28\29\30\31"
local del = "\127"
local c2 = "\128\129\130\131\132\133\134\134\135\136\137\138\139\140\141\142\143\144\145\146\147\148\149\150\151\152\153\154\155\156\157\158\159"
print(c1)
print(del)
print(c2)

c1 = "\0\b\t\n\v\f\r" .. string.char(0x1A) .. "" --0x1A breaks lua parsing on windows
del = ""
c1 = ""
print(c1)
print(del)
print(c2)

--Test output appearing in real-time
for i = 1, 5 do
	os.execute("sleep 1")
	print("foo" .. i)
end

print("@lldbg|") --Stalls future output unless message is pushed (like hitting a breakpoint)

for i = 1, 5 do
	os.execute("sleep 1")
	print("bar" .. i)
end

print("@lldbg|{method = \"test\"}|lldbg@")
print("@lldbg|{{}}|lldbg@")

print("|lldbg@")
print("|lldbg@")
print("@lldbg|")
print("@lldbg|")
print("|lldbg@")
print("@lldbg|")
print("|lldbg@")

print("@lldbg|{")
local x = 1 --Make sure a breakpoint here will hit

--After resuming breakpoint, these should appear in real-time again
for i = 1, 5 do
	os.execute("sleep 1")
	print("baz" .. i)
end
