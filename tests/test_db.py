from datetime import datetime, timedelta, timezone

from centinela import db
from centinela.modelos import Comentario

T0 = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)


def comentario(ident, texto="texto"):
    return Comentario(id_externo=ident, texto=texto, cuenta="cuenta", posicion=0)


def test_no_duplica_y_conserva_la_primera_version():
    con = db.conectar(":memory:")
    art = db.registrar_articulo(con, "m", "https://m.es/a", "A", T0)
    assert db.registrar_articulo(con, "m", "https://m.es/a", "", T0) == art
    assert db.guardar_comentarios(con, art, [comentario("1"), comentario("2")], T0) == 2
    later = T0 + timedelta(hours=1)
    assert db.guardar_comentarios(con, art, [comentario("1", "editado"), comentario("3")], later) == 1
    fila = con.execute("SELECT * FROM comentarios WHERE id_externo = '1'").fetchone()
    assert fila["texto"] == "texto"
    assert fila["ultima_vez_visto"] > fila["primera_vez_visto"]
    articulo = con.execute("SELECT * FROM articulos").fetchone()
    assert articulo["titulo"] == "A" and articulo["comentarios_vistos"] == 2


def test_articulos_para_rastrear():
    con = db.conectar(":memory:")
    viejo = db.registrar_articulo(con, "m", "https://m.es/viejo", "", T0 - timedelta(hours=100))
    reciente = db.registrar_articulo(con, "m", "https://m.es/reciente", "", T0 - timedelta(hours=1))
    nuevo = db.registrar_articulo(con, "m", "https://m.es/nuevo", "", T0)
    db.guardar_comentarios(con, reciente, [], T0 - timedelta(minutes=30))
    db.registrar_articulo(con, "otro", "https://otro.es/x", "", T0)

    def pendientes(horas_entre):
        filas = db.articulos_para_rastrear(
            con, "m", ventana_horas=48, horas_entre_rastreos=horas_entre, limite=10, momento=T0
        )
        return [f["id"] for f in filas]

    assert viejo not in pendientes(6)
    assert pendientes(6) == [nuevo]  # el reciente se miró hace media hora
    assert pendientes(0.25) == [nuevo, reciente]  # primero los nunca rastreados


def test_purgar_respeta_los_hilos_con_candidatos():
    con = db.conectar(":memory:")
    sin_nada = db.registrar_articulo(con, "m", "https://m.es/a", "", T0)
    con_candidato = db.registrar_articulo(con, "m", "https://m.es/b", "", T0)
    db.guardar_comentarios(con, sin_nada, [comentario("1")], T0)
    db.guardar_comentarios(con, con_candidato, [comentario("2"), comentario("3")], T0)
    with con:
        con.execute("UPDATE comentarios SET estado = 'candidato' WHERE id_externo = '3'")

    assert db.purgar(con, 30, T0 + timedelta(days=10)) == 0  # aún no toca
    assert db.purgar(con, 30, T0 + timedelta(days=31)) == 1
    quedan = {f["id_externo"] for f in con.execute("SELECT id_externo FROM comentarios")}
    assert quedan == {"2", "3"}


def test_registro_de_rastreos():
    con = db.conectar(":memory:")
    rid = db.empezar_rastreo(con, "m", T0)
    db.terminar_rastreo(con, rid, T0, articulos=3, nuevos=10, errores=1, detenido_por="HTTP 429")
    fila = con.execute("SELECT * FROM rastreos").fetchone()
    assert (fila["articulos_rastreados"], fila["detenido_por"]) == (3, "HTTP 429")
