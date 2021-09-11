# School Bot

## Description

This vk bot will help you and your classmates to manage your homework, schedule and announcements.
This app was made by me as a school project in 11th grade in pair with my friend that helped me to introduce this project to teachers. By the way i received 5/5 for this project :)
Also as fact at the end of the year half of my classmates actively used this bot and the site (see [bot-client](https://github.com/damirahm/bot-client)). We also tried to make 8th grades use them, but they wasn't prepared to understand this innovations and was too lazy to use it.
But from all of my classmates which used bot i received only good reviews.

### Technologies

I made this bot with nodejs as a more well known back-end technology for me. I used [node-vk-bot-api](https://github.com/node-vk-bot-api/node-vk-bot-api) library as an abstraction above vk api and superagent as a http library. As a database i used mongodb because i've already used it a couple of times before.

## How to use it with your vk group?

1. Download repo

```shell
$ git clone https://github.com/DamirAhm/bot.git
$ cd bot
```

2. Prepare your .env
   a) TOKEN - group token to let application get and send messages
   b) MONGODB_URI - uri to connect your mongodb database
   c) VK_API_KEY - vk api key to let aplication use vk api methods
3. Start application

```shell
$ npm install
$ npm run start

```

## How to work with it?

Firsly you need to register in bot to do this you just need to write anything to group chat. Then bot will ask you from which school and class you are from and on each of this steps bot will let you know what schools\classes are already created, if your school\class is not created yet it will be created. If you are first registered person in your class, bot will ask you to fill schedule and will give you a **redactor** role. After this you are registered. And now you can just use vk keyboard buttons to work with bot.

## Additional information

### Roles

**Student** - with this role you can see homework, announcements and schedule of your class and create homework, but this homework will see only you. Also you can define whether you want to receive notifications from bot or not, when you want to receive notifications and in which days from date of event. And you can change your class or school.
**Redactor** - with this role you have all opportunities of **Student** role but also you can add, chnage and remove homework and announcements and change schedule. And change roles of your classmates from student to redactor and backwards. Redactors can only interact with it's own class.
**Admin** - this role can be obtained only by assigning it to user directly in database or can be assigned by existing admin on site. With this role you have all opportunities of **Redactor** role but you can interact with all classes. Also you can create and delete schools, classes and students on site.
