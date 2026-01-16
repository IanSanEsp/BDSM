document.getElementById("btnUsuarios").addEventListener("click", async () => {
  //const respuesta = await fetch("http://localhost:3000/api/usuarios");
  const respuesta = await fetch("https://bdsm-production-0032.up.railway.app/api/usuarios");
  const usuarios = await respuesta.json();

  const lista = document.getElementById("listaUsuarios");
  lista.innerHTML = "";

  usuarios.forEach(u => {
    const li = document.createElement("li");
    li.textContent = `${u.nombre} — ${u.correo_electronico}`;
    lista.appendChild(li);
  });
});
