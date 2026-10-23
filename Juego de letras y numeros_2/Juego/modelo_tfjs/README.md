# Modelo de letras

Este directorio contiene el modelo local de letras. Lo usan
`ejercicios_practicos_letras.html` y `juegoletras2.html`. Es independiente de
`modelo_numeros_tfjs`, que se usa para las actividades numéricas.

Los pesos se ajustaron desde `modelo_letras.h5` con las imágenes de
`Documents/letras/mis_datos`. La validación 80/20 (semilla 42) pasó de 99,18 % a 99,69 %
de exactitud; la pérdida bajó de 0,03716 a 0,01154 en seis épocas.

Las 28 salidas corresponden, en orden, a `A`–`N`, `NADA`, `O`–`Z` y `Ñ`. La partición de
validación es aleatoria por imagen; si el conjunto contiene capturas muy parecidas de
una misma sesión, la métrica podría sobreestimar el rendimiento con imágenes nuevas.
