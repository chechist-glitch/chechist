# Taichi: simulación física MLS-MPM (el método de Frozen para la nieve) en 2D.
# Tres bloques —agua, gelatina y nieve— caen y chocan. 9.000 partículas, en CPU.
# Render: python mpm.py  → fotogramas en frames/ y luego ffmpeg
import os
import numpy as np
import taichi as ti

ti.init(arch=ti.cpu, default_fp=ti.f32)
n_part, n_grid = 9000, 128
dx, inv_dx = 1 / n_grid, float(n_grid)
dt, p_vol, p_rho = 1e-4, (dx * 0.5) ** 2, 1
p_mass = p_vol * p_rho
E, nu = 5e3, 0.2
mu_0, lambda_0 = E / (2 * (1 + nu)), E * nu / ((1 + nu) * (1 - 2 * nu))
x = ti.Vector.field(2, float, n_part)
v = ti.Vector.field(2, float, n_part)
C = ti.Matrix.field(2, 2, float, n_part)
F = ti.Matrix.field(2, 2, float, n_part)
material = ti.field(int, n_part)
Jp = ti.field(float, n_part)
grid_v = ti.Vector.field(2, float, (n_grid, n_grid))
grid_m = ti.field(float, (n_grid, n_grid))


@ti.kernel
def paso():
    for i, j in grid_m:
        grid_v[i, j] = [0, 0]
        grid_m[i, j] = 0
    for p in x:
        base = (x[p] * inv_dx - 0.5).cast(int)
        fx = x[p] * inv_dx - base.cast(float)
        w = [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1) ** 2, 0.5 * (fx - 0.5) ** 2]
        F[p] = (ti.Matrix.identity(float, 2) + dt * C[p]) @ F[p]
        h = ti.exp(10 * (1.0 - Jp[p]))
        if material[p] == 1:
            h = 0.3
        mu, la = mu_0 * h, lambda_0 * h
        if material[p] == 0:
            mu = 0.0
        U, sig, V = ti.svd(F[p])
        J = 1.0
        for d in ti.static(range(2)):
            new_sig = sig[d, d]
            if material[p] == 2:
                new_sig = ti.min(ti.max(sig[d, d], 1 - 2.5e-2), 1 + 4.5e-3)
            Jp[p] *= sig[d, d] / new_sig
            sig[d, d] = new_sig
            J *= new_sig
        if material[p] == 0:
            F[p] = ti.Matrix.identity(float, 2) * ti.sqrt(J)
        elif material[p] == 2:
            F[p] = U @ sig @ V.transpose()
        stress = 2 * mu * (F[p] - U @ V.transpose()) @ F[p].transpose() + ti.Matrix.identity(float, 2) * la * J * (J - 1)
        stress = (-dt * p_vol * 4 * inv_dx * inv_dx) * stress
        affine = stress + p_mass * C[p]
        for i, j in ti.static(ti.ndrange(3, 3)):
            offset = ti.Vector([i, j])
            dpos = (offset.cast(float) - fx) * dx
            weight = w[i][0] * w[j][1]
            grid_v[base + offset] += weight * (p_mass * v[p] + affine @ dpos)
            grid_m[base + offset] += weight * p_mass
    for i, j in grid_m:
        if grid_m[i, j] > 0:
            grid_v[i, j] = (1 / grid_m[i, j]) * grid_v[i, j]
            grid_v[i, j][1] -= dt * 50
            if i < 3 and grid_v[i, j][0] < 0: grid_v[i, j][0] = 0
            if i > n_grid - 3 and grid_v[i, j][0] > 0: grid_v[i, j][0] = 0
            if j < 3 and grid_v[i, j][1] < 0: grid_v[i, j][1] = 0
            if j > n_grid - 3 and grid_v[i, j][1] > 0: grid_v[i, j][1] = 0
    for p in x:
        base = (x[p] * inv_dx - 0.5).cast(int)
        fx = x[p] * inv_dx - base.cast(float)
        w = [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1.0) ** 2, 0.5 * (fx - 0.5) ** 2]
        new_v = ti.Vector.zero(float, 2)
        new_C = ti.Matrix.zero(float, 2, 2)
        for i, j in ti.static(ti.ndrange(3, 3)):
            dpos = ti.Vector([i, j]).cast(float) - fx
            g_v = grid_v[base + ti.Vector([i, j])]
            weight = w[i][0] * w[j][1]
            new_v += weight * g_v
            new_C += 4 * inv_dx * weight * g_v.outer_product(dpos)
        v[p], C[p] = new_v, new_C
        x[p] += dt * v[p]


@ti.kernel
def inicio():
    grupo = n_part // 3
    for i in range(n_part):
        g = i // grupo
        x[i] = [ti.random() * 0.2 + 0.25 + 0.12 * g, ti.random() * 0.2 + 0.08 + 0.28 * g]
        material[i] = g
        v[i] = [0, 0]
        F[i] = ti.Matrix([[1, 0], [0, 1]])
        Jp[i] = 1


inicio()
os.makedirs("frames", exist_ok=True)
S = 720
colores = np.array([[0x3a, 0x9b, 0xff], [0xff, 0x4f, 0x8b], [0xf4, 0xf6, 0xff]], dtype=np.float32) / 255
for f in range(150):
    for s in range(int(2e-3 // dt)):
        paso()
    pos = x.to_numpy()
    mat = material.to_numpy()
    img = np.zeros((S, S, 3), np.float32)
    img[:] = np.array([0.04, 0.05, 0.09])
    px = np.clip((pos * S).astype(int), 0, S - 2)
    for k in range(3):
        sel = mat == k
        xs, ys = px[sel, 0], S - 1 - px[sel, 1]
        for ox, oy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            img[np.clip(ys + oy, 0, S - 1), np.clip(xs + ox, 0, S - 1)] = colores[k]
    ti.tools.imwrite(np.transpose(img[::-1], (1, 0, 2)), f"frames/f{f:04d}.png")
print("ok")
