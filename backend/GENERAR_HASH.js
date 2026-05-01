import bcrypt from "bcrypt";

const passwordPlano = "adminpwd"; //aca la contra
const saltRounds = 10;

const run = async () => {
  const hash = await bcrypt.hash(passwordPlano, saltRounds);
  console.log("Hash bcrypt:", hash);
};

run().catch(console.error);