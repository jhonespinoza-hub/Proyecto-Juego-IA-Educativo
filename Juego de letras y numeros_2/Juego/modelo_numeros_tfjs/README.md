# Modelo de números

Este directorio contiene el modelo local de números convertido desde `modelo_numeros.h5`.
Lo usan `ejercicios_numeros.html`, `juego_reaccion_numeros.html` y `juegonumeros2.html`.

El modelo recibe imágenes de `224 x 224` píxeles y devuelve 11 valores. El archivo H5 no
incluye nombres de clases; las páginas interpretan las salidas en este orden:
`0, 1, 2, 3, 4, 5, 6, 7, 8, 9, NADA`. Confirma que ese orden coincide con el usado al
entrenar el modelo antes de cambiar o volver a exportar sus pesos.
