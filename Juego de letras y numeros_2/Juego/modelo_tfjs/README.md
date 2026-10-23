# Modelo de letras

Este directorio contiene el modelo local de letras. Lo usan
`ejercicios_practicos_letras.html` y `juegoletras2.html`. Es independiente de
`modelo_numeros_tfjs`, que se usa para las actividades numéricas.

El modelo activo se convirtió desde `modelo_keras.h5`. Recibe imágenes de
224 × 224 píxeles; su capa de normalización está integrada en el modelo.

El modelo devuelve 28 salidas. `class_names.json` las asocia, en orden, con
`A`–`N`, `NADA`, `O`–`Z` y `Ñ`.
