# Modelo de números

Este directorio contiene el modelo local de números reentrenado con las muestras de
`Downloads/numeros/datos`, inicializado desde `modelo_numeros(2).h5`. Lo usan
`ejercicios_numeros.html`, `juego_reaccion_numeros.html` y `juegonumeros2.html`.

El modelo recibe imágenes de `224 x 224` píxeles y devuelve 11 valores, en este orden:
`0, 1, 2, 3, 4, 5, 6, 7, 8, 9, NADA`.

El ajuste fino se hizo con una partición 80/20, semilla 42, y seis épocas. La exactitud
en validación pasó de 99,942 % a 99,971 % (pérdida: de 0,001755 a 0,000909). El conjunto
usado tenía 17.246 imágenes; la clase `NADA` contiene 2.175 y las clases numéricas entre
1.504 y 1.526 imágenes cada una.
