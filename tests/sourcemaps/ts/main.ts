import {Sub} from "./sub/sub";

function printFoobar(this: any) {
    const $renamed = "blah";
    const foobar = Sub.foobar();
    console.log(foobar);
}

const $renamed = "har";
printFoobar();
