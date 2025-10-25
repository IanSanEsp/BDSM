create database dbvoximonlabs;
use dbvoximonlabs;

create table usuario (
    id_usuario char(50) primary key,
    nombre  char(50) not null,
    apmat char(50) not null,
    appat char(50) not null,
    correo_electronico text not null ,
    contrasena char(50) not null,
    tipo_user enum('usuario', 'adminisrtrador') not null
);

drop table if exists salon;
create table salon (
    id_salon char(50) primary key,
    nombre char(50) not null,
    piso enum('1','2', '3') not null,
    tipo enum('Aula','Laboratorio') not null,
    estado enum('Disponible','En Mantenimiento','Ocupado') not null
);

create table profesor (
    id_profesor int primary key auto_increment,
    prof_nombre char(100) not null,
    prof_appat char(50) not null,
    prof_apmat char(50) not null
);

create table materia (
    id_materia int primary key auto_increment,
    sig_nombre char(100) not null,
    id_profesor int not null,
    foreign key (id_profesor) references profesor(id_profesor)
);

create table grupo (
    id_grupo int primary key auto_increment,
    grupo_nombre char(50) not null,
    id_materia int not null,
    foreign key (id_materia) references materia(id_materia)
);

drop table if exists horario_grupo;
create table horario_grupo (
    id_horario int primary key auto_increment,
    id_grupo int not null,
    id_salon char(50),
    dia enum('Lunes','Martes','Miércoles','Jueves','Viernes') not null,
    hora_inicio time not null,
    hora_fin time not null,
    bloque_horario char(70) as (concat(dia, ' ', date_format(hora_inicio, ''), '-', date_format(hora_fin, ''))) stored,
    foreign key (id_grupo) references grupo(id_grupo),
    foreign key (id_salon) references salon(id_salon)
);