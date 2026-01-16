document.addEventListener("DOMContentLoaded", () => {
    const rawUser = localStorage.getItem("usuario");
    const legacyUser = localStorage.getItem("loggedUser");
    const token = localStorage.getItem("token");

    // If there is no stored session, keep defaults to avoid breaking the UI.
    let displayName = "Invitado";

    if (rawUser) {
        try {
            const user = JSON.parse(rawUser);
            const parts = [user.nombre, user.apellido_paterno, user.apellido_materno].filter(Boolean);
            const fallback = user.nombre_completo || user.correo || "Invitado";
            displayName = (parts.join(" ") || fallback).trim();
        } catch (err) {
            displayName = "Invitado";
        }
    } else if (legacyUser) {
        displayName = legacyUser;
    }

    document.querySelectorAll(".user-name").forEach((el) => {
        el.textContent = displayName;
    });
});
