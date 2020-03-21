const
    mongoose = require("mongoose"),
    Student = require("../../Models/StudentModel"),
    Class = require("../../Models/ClassModel"),
    {DataBase} = require("../DataBase"),
    {Roles} = require("../../Models/utils");


//Getters by _id
describe("getStudentBy_Id", () => {
    let MockStudent;
    beforeAll(async () => {
        MockStudent = await DataBase.createStudent(Math.ceil(Math.random() * 100 + 1));
    });
    afterAll(async () => {
        await Student.deleteMany({});
    });

    it("should return right model", async () => {
        const student = await DataBase.getStudentBy_Id(MockStudent._id);

        return expect(student).toEqual(MockStudent);
    });
    it("should null if _id is not in collection", async () => {
        const result = await DataBase.getStudentBy_Id("not even id");

        return expect(result).toBeNull();
    });
    it("should throw error if _id is undefined", async () => {
        return DataBase.getStudentBy_Id()
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
    it("should throw error if _id is not type of string", () => {
        return DataBase.getStudentBy_Id(1488)
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
});
describe("getClassBy_Id", () => {
    let MockClass;
    beforeAll(async () => {
        MockClass = await DataBase.createClass(Math.ceil(Math.random() * 10) + "A");
    });
    afterAll(async () => {
        await Class.deleteMany({});
    });

    it("should return right model", async () => {
        const _class = await DataBase.getClassBy_Id(MockClass._id);

        return expect(_class).toEqual(MockClass);
    });
    it("should null if _id is not in collection", async () => {
        const result = await DataBase.getClassBy_Id("not and id");

        return expect(result).toBeNull();
    });
    it("should throw error if _id is undefined", () => {
        return DataBase.getClassBy_Id()
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
    it("should throw error if _id is not type of string", () => {
        return DataBase.getClassBy_Id(1488)
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
});

//Getters by properties
describe("getStudentByVkId", () => {
    let MockStudent;
    beforeAll(async () => {
        MockStudent = await DataBase.createStudent(Math.ceil(Math.random() * 100 + 1));
    });
    afterAll(async () => {
        await Student.deleteMany({});
    });

    it("should return right model", async () => {
        const student = await DataBase.getStudentByVkId(MockStudent.vkId);

        return expect(student).toEqual(MockStudent);
    });
    it("should null if vkId is not in collection", async () => {
        const result = await DataBase.getStudentByVkId(1488);

        return expect(result).toBeNull();
    });
    it("should throw error if VkId is undefined", () => {
        return DataBase.getStudentByVkId()
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
    it("should throw error if VkId is not type of number", () => {
        return DataBase.getStudentByVkId("not a number")
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
});
describe("getClassByName", () => {
    let MockClass;
    beforeAll(async () => {
        MockClass = await DataBase.createClass(Math.ceil(Math.random() * 10) + "A");
    });
    afterAll(async () => {
        await Class.deleteMany({});
    });

    it("should return right model", async () => {
        const _class = await DataBase.getClassByName(MockClass.name);

        return expect(_class).toEqual(MockClass);
    });
    it("should null if _id is not in collection", async () => {
        const result = await DataBase.getClassByName("not even name");

        return expect(result).toBeNull();
    });
    it("should throw error if name is undefined", () => {
        return DataBase.getClassByName()
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
    it("should throw error if name is not type of string", () => {
        return DataBase.getClassByName(1488)
            .catch(err => expect(err).toBeInstanceOf(TypeError))
    });
});

//Others
describe("getAllContributors", () => {
    beforeAll(async () => {
        const Student1 = await DataBase.createStudent(1);
        const Student2 = await DataBase.createStudent(2);
        await DataBase.createStudent(3);
        await Student1.updateOne({role: Roles.contributor});
        await Student2.updateOne({role: Roles.contributor});
    });
    afterAll(async () => {
        await Student.deleteMany({});
    });

    it("should return array of contributors", async () => {
        const result = await DataBase.getAllContributors();

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
        expect(result.every(st => st.vkId === 1 || st.vkId === 2)).toBe(true);
    });
});