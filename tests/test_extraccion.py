from centinela.rastreo.extraccion import construir_comentarios, huella


def crudo(**campos):
    base = {"id": None, "texto": "", "cuenta": "", "fecha_texto": "", "fecha_maquina": None,
            "respuesta_a": None, "padre_indice": -1}
    return base | campos


def test_respuestas_por_anidamiento_y_por_atributo():
    comentarios = construir_comentarios([
        crudo(id="1", texto="padre", cuenta="a"),
        crudo(id="2", texto="hijo", cuenta="b", padre_indice=0),
        crudo(id="3", texto="con atributo", respuesta_a="1"),
    ])
    assert [(c.id_externo, c.respuesta_a) for c in comentarios] == [("1", None), ("2", "1"), ("3", "1")]


def test_sin_id_se_usa_una_huella_estable():
    a = construir_comentarios([crudo(texto="hola", cuenta="x", fecha_texto="hace 1 hora")])
    b = construir_comentarios([crudo(texto="hola", cuenta="x", fecha_texto="hace 3 horas")])
    assert a[0].id_externo == b[0].id_externo == huella("x", "hola")


def test_repetidos():
    comentarios = construir_comentarios([
        crudo(texto="igual", cuenta="x"),
        crudo(texto="igual", cuenta="x"),  # mismo texto dos veces: son dos comentarios
        crudo(id="7", texto="destacado"),
        crudo(id="7", texto="destacado"),  # el medio lo enseña dos veces: es uno
    ])
    assert [c.id_externo for c in comentarios] == [huella("x", "igual"), huella("x", "igual") + "~2", "7"]


def test_sin_texto_no_cuenta_pero_sus_respuestas_si():
    comentarios = construir_comentarios([
        crudo(id="1", texto=""),
        crudo(id="2", texto="respuesta", padre_indice=0),
    ])
    assert [(c.id_externo, c.respuesta_a) for c in comentarios] == [("2", "1")]
