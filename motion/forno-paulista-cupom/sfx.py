# Trilha de efeitos sintetizada, sincronizada com a timeline da cena
import wave, struct, math, random
SR, DUR = 44100, 10.0
N = int(SR * DUR); out = [0.0] * N
random.seed(4)
def add(t0, fn, length):
    i0 = int(t0 * SR)
    for i in range(int(length * SR)):
        if 0 <= i0 + i < N: out[i0 + i] += fn(i / SR)
# fogo: ruído marrom + estalos
b = 0.0
for i in range(N):
    t = i / SR
    b = 0.985 * b + random.uniform(-1, 1) * 0.15
    env = min(1, t / 0.8) * (1 - 0.35 * min(1, max(0, (t - 3.5) / 0.4)))
    out[i] += b * 0.5 * env
for _ in range(90):
    t0 = random.uniform(0.2, 10); a = random.uniform(.15, .5)
    add(t0, lambda x, a=a: random.uniform(-1, 1) * a * math.exp(-x * 300), 0.03)
def boom(t0, f0, amp, dec):
    add(t0, lambda x: math.sin(2 * math.pi * (f0 * x - 18 * x * x)) * amp * math.exp(-x * dec), 1.2)
def whoosh(t0, length, amp):
    st = {"y": 0.0}
    def f(x):
        st["y"] = 0.9 * st["y"] + random.uniform(-1, 1) * 0.1
        return st["y"] * amp * math.sin(math.pi * x / length) ** 2
    add(t0, f, length)
def ding(t0, amp):
    add(t0, lambda x: (math.sin(2*math.pi*1318*x) + .5*math.sin(2*math.pi*1975*x)) * amp * math.exp(-x * 5), 1.5)
whoosh(0.05, 1.0, 2.5)
for i in range(6): boom(2.45 + i * .11 + .32 * .72, 70 + i * 6, .35, 9)
whoosh(3.1, 0.5, 3.5); boom(3.5, 55, .7, 4)
whoosh(4.7, 0.45, 3); boom(5.15, 48, .9, 5)
add(5.6, lambda x: math.sin(2*math.pi*(600*x + 900*x*x)) * .3 * math.exp(-x*18), .3)
ding(6.25, .18)
peak = max(abs(v) for v in out) or 1
with wave.open("sfx.wav", "w") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", int(v / peak * 0.85 * 32767)) for v in out))
