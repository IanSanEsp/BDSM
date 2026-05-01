CREATE DATABASE IF NOT EXISTS SistemaHorariosCECYT9;

USE SistemaHorariosCECYT9;

CREATE TABLE Grupos (
    id_grupo INT PRIMARY KEY AUTO_INCREMENT,
    nombre_grupo VARCHAR(20) NOT NULL,
    semestre INT NOT NULL,
    area_estudio VARCHAR(20) NOT NULL,
    turno VARCHAR(20) NOT NULL
);

CREATE TABLE Usuarios (
    id_usuarios INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    tipo_usuario VARCHAR(30) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    turno VARCHAR(20) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    id_grupo INT NULL,
    CONSTRAINT fk_usuario_grupo
        FOREIGN KEY (id_grupo) REFERENCES Grupos(id_grupo)
);


CREATE TABLE Profesores (
    id_profesor INT PRIMARY KEY,
    tipo_profesor VARCHAR(20) NOT NULL,
    materia VARCHAR(100) NOT NULL,
    estado_asistencia VARCHAR(20) DEFAULT 'Presente',
    CONSTRAINT fk_profesor_usuario
        FOREIGN KEY (id_profesor) REFERENCES Usuarios(id_usuarios)

);


CREATE TABLE Prefectos (
    id_prefecto INT PRIMARY KEY,
    tipo_prefecto VARCHAR(20) NOT NULL,
    piso_asignado INT NULL,
    CONSTRAINT fk_prefecto_usuario
        FOREIGN KEY (id_prefecto) REFERENCES Usuarios(id_usuarios)

);

CREATE TABLE Salones (
    id_salon INT PRIMARY KEY AUTO_INCREMENT,
    numero_salon VARCHAR(10) NOT NULL,
    piso INT NOT NULL,
    capacidad INT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    proyector BOOLEAN DEFAULT FALSE,
    estado VARCHAR(20) DEFAULT 'Disponible'
);

CREATE TABLE Materias (
    id_materia INT PRIMARY KEY AUTO_INCREMENT,
    nombre_materia VARCHAR(100) NOT NULL,
    area_estudio VARCHAR(20) NOT NULL
);

CREATE TABLE Horario_Fijo (
    id_horario_fijo INT PRIMARY KEY AUTO_INCREMENT,
    id_grupo INT NOT NULL,
    id_profesor INT NOT NULL,
    id_salon INT NOT NULL,
    dia VARCHAR(20) NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    bloque_horario INT NOT NULL,
    id_materia INT NOT NULL,
    CONSTRAINT fk_hf_grupo
        FOREIGN KEY (id_grupo) REFERENCES Grupos(id_grupo),
    CONSTRAINT fk_hf_profesor
        FOREIGN KEY (id_profesor) REFERENCES Profesores(id_profesor),
    CONSTRAINT fk_hf_salon
        FOREIGN KEY (id_salon) REFERENCES Salones(id_salon),
    CONSTRAINT fk_hf_materia
        FOREIGN KEY (id_materia) REFERENCES Materias(id_materia)
);


CREATE TABLE Horario_Dinamico (
    id_horario_dinamico INT PRIMARY KEY AUTO_INCREMENT,
    id_horario_fijo INT NOT NULL,
    fecha DATE NOT NULL,
    id_salon_temporal INT NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    motivo_cambio VARCHAR(200) NOT NULL,
    bloque_horario INT NOT NULL,
    persona_autoriza INT NOT NULL,
    CONSTRAINT fk_hd_hf
        FOREIGN KEY (id_horario_fijo) REFERENCES Horario_Fijo(id_horario_fijo),
    CONSTRAINT fk_hd_salon
        FOREIGN KEY (id_salon_temporal) REFERENCES Salones(id_salon),
    CONSTRAINT fk_hd_usuario
        FOREIGN KEY (persona_autoriza) REFERENCES Prefectos(id_prefecto)
);

CREATE TABLE Ausencias_Profesor (
    id_ausencia INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    id_profesor INT NOT NULL,
    id_grupo INT NOT NULL,
    accion_tomada VARCHAR(100) NOT NULL,
    CONSTRAINT fk_ap_profesor
        FOREIGN KEY (id_profesor) REFERENCES Profesores(id_profesor),
    CONSTRAINT fk_ap_grupo
        FOREIGN KEY (id_grupo) REFERENCES Grupos(id_grupo)
);

CREATE TABLE IF NOT EXISTS Salones_Favoritos (
    id_salonfav INT PRIMARY KEY AUTO_INCREMENT,
    id_usuario INT NOT NULL,
    id_salon INT NOT NULL,
    fecha_agregado DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_favorito_salon (id_usuario, id_salon),
    FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuarios),
    FOREIGN KEY (id_salon) REFERENCES Salones(id_salon)
);

CREATE TABLE IF NOT EXISTS Grupos_Favoritos (
    id_grupofav INT PRIMARY KEY AUTO_INCREMENT,
    id_usuario INT NOT NULL,
    id_grupo INT NOT NULL,
    fecha_agregado DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_favorito_grupo (id_usuario, id_grupo),
    FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuarios),
    FOREIGN KEY (id_grupo) REFERENCES Grupos(id_grupo)
);

ALTER TABLE Salones_Favoritos ADD COLUMN mostrar_inicio BOOLEAN DEFAULT FALSE;
ALTER TABLE Grupos_Favoritos ADD COLUMN mostrar_inicio BOOLEAN DEFAULT FALSE;